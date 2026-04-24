import {
    and,
    desc,
    eq,
    isNull,
} from "drizzle-orm";
import { letterRequests, letterDeliveryLog } from "../../../drizzle/schema";
import { getDb } from "../core";
import { storageGet } from "../../storage";

export async function getLetterRequestById(id: number) {
    const db = await getDb();
    if (!db) return undefined;
    const result = await db
        .select()
        .from(letterRequests)
        .where(eq(letterRequests.id, id))
        .limit(1);
    return result[0];
}

export async function getLetterRequestsByUserId(userId: number) {
    const db = await getDb();
    if (!db) return [];
    const rows = await db
        .select({
            id: letterRequests.id,
            letterType: letterRequests.letterType,
            subject: letterRequests.subject,
            status: letterRequests.status,
            jurisdictionState: letterRequests.jurisdictionState,
            pdfStoragePath: letterRequests.pdfStoragePath,
            createdAt: letterRequests.createdAt,
            approvedByRole: letterRequests.approvedByRole,
            isFreePreview: letterRequests.isFreePreview,
            freePreviewUnlockAt: letterRequests.freePreviewUnlockAt,
        })
        .from(letterRequests)
        .where(
            and(eq(letterRequests.userId, userId), isNull(letterRequests.archivedAt))
        )
        .orderBy(desc(letterRequests.createdAt));

    // Resolve presigned URLs on-demand — never persist public URLs in DB
    return Promise.all(
        rows.map(async row => {
            let pdfUrl: string | null = null;
            if (row.pdfStoragePath) {
                try {
                    const resolved = await storageGet(row.pdfStoragePath);
                    pdfUrl = resolved.url;
                } catch {
                    /* non-blocking: PDF URL unavailable */
                }
            }
            return { ...row, pdfUrl };
        })
    );
}

/** Subscriber-safe: never returns AI draft, attorney edits, or internal research data */
export async function getLetterRequestSafeForSubscriber(
    id: number,
    userId: number
) {
    const db = await getDb();
    if (!db) return undefined;
    const result = await db
        .select({
            id: letterRequests.id,
            letterType: letterRequests.letterType,
            subject: letterRequests.subject,
            issueSummary: letterRequests.issueSummary,
            jurisdictionCountry: letterRequests.jurisdictionCountry,
            jurisdictionState: letterRequests.jurisdictionState,
            jurisdictionCity: letterRequests.jurisdictionCity,
            intakeJson: letterRequests.intakeJson,
            status: letterRequests.status,
            priority: letterRequests.priority,
            currentFinalVersionId: letterRequests.currentFinalVersionId,
            pdfStoragePath: letterRequests.pdfStoragePath,
            pdfUrl: letterRequests.pdfUrl,
            qualityDegraded: letterRequests.qualityDegraded,
            submittedByAdmin: letterRequests.submittedByAdmin,
            lastStatusChangedAt: letterRequests.lastStatusChangedAt,
            draftReadyEmailSent: letterRequests.draftReadyEmailSent,
            isFreePreview: letterRequests.isFreePreview,
            freePreviewUnlockAt: letterRequests.freePreviewUnlockAt,
            freePreviewEmailSentAt: letterRequests.freePreviewEmailSentAt,
            freePreviewViewedAt: letterRequests.freePreviewViewedAt,
            createdAt: letterRequests.createdAt,
            updatedAt: letterRequests.updatedAt,
        })
        .from(letterRequests)
        .where(and(eq(letterRequests.id, id), eq(letterRequests.userId, userId)))
        .limit(1);
    const row = result[0];
    if (!row) return undefined;
    // Resolve a short-lived presigned URL on-demand — never serve a permanent URL from DB
    let pdfUrl: string | null = null;
    if (row.pdfStoragePath) {
        try {
            const resolved = await storageGet(row.pdfStoragePath);
            pdfUrl = resolved.url;
        } catch {
            /* non-blocking */
        }
    }
    return { ...row, pdfUrl };
}

/**
 * Fetch all delivery log entries for a letter (for the subscriber detail view).
 */
export async function getDeliveryLogByLetterId(letterRequestId: number) {
    const db = await getDb();
    if (!db) return [];
    return db
        .select()
        .from(letterDeliveryLog)
        .where(eq(letterDeliveryLog.letterRequestId, letterRequestId))
        .orderBy(desc(letterDeliveryLog.createdAt));
}
