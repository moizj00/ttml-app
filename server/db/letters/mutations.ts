import {
    and,
    eq,
    inArray,
    isNull,
    or,
} from "drizzle-orm";
import {
    letterRequests,
    users,
    letterDeliveryLog,
    workflowJobs,
    researchRuns,
} from "../../../drizzle/schema";
import { getDb } from "../core";
import { assignRoleId } from "../admin";
import { ALLOWED_TRANSITIONS } from "../../../shared/types";
import { logReviewAction } from "../review-actions";
import { getLetterRequestById } from "./query";

export async function createLetterRequest(data: {
    userId: number;
    letterType: string;
    subject: string;
    issueSummary?: string;
    jurisdictionCountry?: string;
    jurisdictionState?: string;
    jurisdictionCity?: string;
    intakeJson?: unknown;
    priority?: "low" | "normal" | "high" | "urgent";
    templateId?: number;
    submittedByAdmin?: boolean;
    isFreePreview?: boolean;
    freePreviewUnlockAt?: Date;
}) {
    const db = await getDb();
    if (!db) throw new Error("Database not available");
    let submitterRoleId: string | null = null;
    try {
        const submitter = await db
            .select({ subscriberId: users.subscriberId, role: users.role })
            .from(users)
            .where(eq(users.id, data.userId))
            .limit(1);
        if (submitter.length > 0) {
            if (submitter[0].subscriberId) {
                submitterRoleId = submitter[0].subscriberId;
            } else if (submitter[0].role === "subscriber") {
                submitterRoleId = await assignRoleId(data.userId, "subscriber");
            }
        }
    } catch {
        /* non-blocking */
    }
    const result = await db
        .insert(letterRequests)
        .values({
            userId: data.userId,
            letterType: data.letterType as any,
            subject: data.subject,
            issueSummary: data.issueSummary,
            jurisdictionCountry: data.jurisdictionCountry ?? "US",
            jurisdictionState: data.jurisdictionState,
            jurisdictionCity: data.jurisdictionCity,
            intakeJson: data.intakeJson as any,
            status: "submitted",
            priority: data.priority ?? "normal",
            lastStatusChangedAt: new Date(),
            submitterRoleId,
            templateId: data.templateId ?? null,
            submittedByAdmin: data.submittedByAdmin ?? false,
            isFreePreview: data.isFreePreview ?? false,
            freePreviewUnlockAt: data.freePreviewUnlockAt ?? null,
        })
        .returning({ insertId: letterRequests.id });
    return result[0];
}

export async function updateLetterStatus(
    id: number,
    status: string,
    options?: {
        assignedReviewerId?: number | null;
        approvedByRole?: string | null;
        force?: boolean;
        reason?: string;
    }
) {
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    const updateData: Record<string, unknown> = {
        status,
        lastStatusChangedAt: new Date(),
        updatedAt: new Date(),
    };
    if (options?.assignedReviewerId !== undefined)
        updateData.assignedReviewerId = options.assignedReviewerId;
    if (options?.approvedByRole !== undefined)
        updateData.approvedByRole = options.approvedByRole;

    if (options?.force) {
        // Fetch current status before update for audit trail
        const current = await db
            .select({ status: letterRequests.status })
            .from(letterRequests)
            .where(eq(letterRequests.id, id))
            .limit(1);
        const fromStatus = current[0]?.status ?? "unknown";

        const result = await db
            .update(letterRequests)
            .set(updateData as any)
            .where(eq(letterRequests.id, id))
            .returning({ id: letterRequests.id });
        if (result.length === 0) {
            throw new Error(`Letter ${id} not found`);
        }

        // Audit forced transitions so they appear in the review_actions trail
        try {
            await logReviewAction({
                letterRequestId: id,
                actorType: "system",
                action: "force_transition",
                fromStatus,
                toStatus: status,
                noteText:
                    options.reason ?? `Forced transition: ${fromStatus} → ${status}`,
                noteVisibility: "internal",
            });
        } catch {
            // Non-blocking: audit failure should not break the status update
        }
        return;
    }

    const allowedFromStatuses = Object.entries(ALLOWED_TRANSITIONS)
        .filter(([, targets]) => (targets as string[]).includes(status))
        .map(([from]) => from);

    const statusConditions = [
        eq(letterRequests.status, status as any),
        ...(allowedFromStatuses.length > 0
            ? [inArray(letterRequests.status, allowedFromStatuses as any)]
            : []),
    ];

    const result = await db
        .update(letterRequests)
        .set(updateData as any)
        .where(and(eq(letterRequests.id, id), or(...statusConditions)))
        .returning({ id: letterRequests.id, status: letterRequests.status });

    if (result.length === 0) {
        const letter = await getLetterRequestById(id);
        if (!letter) throw new Error(`Letter ${id} not found`);
        if (letter.status === status) return;
        throw new Error(
            `Invalid status transition: ${letter.status} → ${status}. ` +
            `Allowed from ${letter.status}: [${((ALLOWED_TRANSITIONS as any)[letter.status] ?? []).join(", ")}]`
        );
    }
}

export async function updateLetterVersionPointers(
    id: number,
    pointers: { currentAiDraftVersionId?: number; currentFinalVersionId?: number }
) {
    const db = await getDb();
    if (!db) throw new Error("Database not available");
    await db
        .update(letterRequests)
        .set({ ...pointers, updatedAt: new Date() } as any)
        .where(eq(letterRequests.id, id));
}

export async function setLetterResearchUnverified(
    id: number,
    unverified: boolean
) {
    const db = await getDb();
    if (!db) throw new Error("Database not available");
    await db
        .update(letterRequests)
        .set({ researchUnverified: unverified, updatedAt: new Date() })
        .where(eq(letterRequests.id, id));
}

export async function setLetterQualityDegraded(id: number, degraded: boolean) {
    const db = await getDb();
    if (!db) throw new Error("Database not available");
    await db
        .update(letterRequests)
        .set({ qualityDegraded: degraded, updatedAt: new Date() })
        .where(eq(letterRequests.id, id));
}

export async function claimLetterForReview(
    letterId: number,
    reviewerId: number
) {
    const db = await getDb();
    if (!db) throw new Error("Database not available");
    let reviewerRoleId: string | null = null;
    try {
        const reviewer = await db
            .select({ attorneyId: users.attorneyId, role: users.role })
            .from(users)
            .where(eq(users.id, reviewerId))
            .limit(1);
        if (reviewer.length > 0) {
            if (reviewer[0].attorneyId) {
                reviewerRoleId = reviewer[0].attorneyId;
            } else if (reviewer[0].role === "attorney") {
                reviewerRoleId = await assignRoleId(reviewerId, "attorney");
            }
        }
    } catch {
        /* non-blocking */
    }
    const result = await db
        .update(letterRequests)
        .set({
            assignedReviewerId: reviewerId,
            reviewerRoleId,
            status: "under_review",
            lastStatusChangedAt: new Date(),
            updatedAt: new Date(),
        })
        .where(
            and(
                eq(letterRequests.id, letterId),
                inArray(letterRequests.status, [
                    "pending_review",
                    "under_review",
                    "client_revision_requested",
                ] as any),
                or(
                    isNull(letterRequests.assignedReviewerId),
                    eq(letterRequests.assignedReviewerId, reviewerId)
                )
            )
        )
        .returning({ id: letterRequests.id });

    if (result.length === 0) {
        const letter = await getLetterRequestById(letterId);
        if (!letter) throw new Error("Letter not found");
        if (letter.assignedReviewerId && letter.assignedReviewerId !== reviewerId) {
            throw new Error("Letter is already claimed by another reviewer");
        }
        if (
            letter.status !== "pending_review" &&
            letter.status !== "under_review"
        ) {
            throw new Error(`Letter cannot be claimed in status: ${letter.status}`);
        }
        throw new Error("Letter claim failed");
    }
}

export async function updateLetterPdfUrl(id: number, pdfUrl: string) {
    const db = await getDb();
    if (!db) throw new Error("Database not available");
    await db
        .update(letterRequests)
        .set({ pdfUrl, updatedAt: new Date() } as any)
        .where(eq(letterRequests.id, id));
}

export async function updateLetterStoragePath(id: number, pdfKey: string) {
    const db = await getDb();
    if (!db) throw new Error("Database not available");
    await db
        .update(letterRequests)
        .set({ pdfStoragePath: pdfKey, updatedAt: new Date() } as any)
        .where(eq(letterRequests.id, id));
}

export async function archiveLetterRequest(id: number, userId: number) {
    const db = await getDb();
    if (!db) throw new Error("Database not available");
    const result = await db
        .update(letterRequests)
        .set({ archivedAt: new Date(), updatedAt: new Date() } as any)
        .where(and(eq(letterRequests.id, id), eq(letterRequests.userId, userId)));
    return result;
}

export async function markPriorPipelineRunsSuperseded(
    letterId: number
): Promise<void> {
    const db = await getDb();
    if (!db) return;
    await db
        .update(workflowJobs)
        .set({
            status: "failed",
            errorMessage: JSON.stringify({
                code: "SUPERSEDED",
                message: "Superseded by new pipeline run",
                stage: "pipeline",
                category: "permanent",
            }),
            updatedAt: new Date(),
        } as any)
        .where(
            and(
                eq(workflowJobs.letterRequestId, letterId),
                inArray(workflowJobs.status, ["queued", "running"] as any)
            )
        );
    await db
        .update(researchRuns)
        .set({
            status: "failed",
            errorMessage: JSON.stringify({
                code: "SUPERSEDED",
                message: "Superseded by new pipeline run",
                stage: "pipeline",
                category: "permanent",
            }),
            updatedAt: new Date(),
        } as any)
        .where(
            and(
                eq(researchRuns.letterRequestId, letterId),
                inArray(researchRuns.status, ["queued", "running"] as any)
            )
        );
}

/**
 * Write a delivery log entry when a letter is sent to the recipient.
 */
export async function createDeliveryLogEntry(data: {
    letterRequestId: number;
    recipientEmail?: string;
    recipientName?: string;
    deliveryMethod?: "email" | "portal" | "certified_mail";
    resendMessageId?: string;
}) {
    const db = await getDb();
    if (!db) throw new Error("Database not available");
    await db.insert(letterDeliveryLog).values({
        letterRequestId: data.letterRequestId,
        recipientEmail: data.recipientEmail ?? null,
        recipientName: data.recipientName ?? null,
        deliveryMethod: data.deliveryMethod ?? "email",
        deliveryStatus: "sent",
        resendMessageId: data.resendMessageId ?? null,
        deliveredAt: new Date(),
    });
}
