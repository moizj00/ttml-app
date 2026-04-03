import { and, desc, eq, inArray, isNull, lt, ne, or, sql } from "drizzle-orm";
import { captureServerException } from "../sentry";
import {
  adminVerificationCodes,
  attachments,
  blogPosts,
  commissionLedger,
  discountCodes,
  emailVerificationTokens,
  letterRequests,
  letterVersions,
  letterQualityScores,
  notifications,
  payoutRequests,
  pipelineLessons,
  researchRuns,
  reviewActions,
  subscriptions,
  users,
  workflowJobs,
} from "../../drizzle/schema";
import type { InsertUser, InsertPipelineLesson, InsertLetterQualityScore } from "../../drizzle/schema";
import { getDb } from "./core";
import { assignRoleId } from "./admin";

// ═══════════════════════════════════════════════════════
// LETTER REQUEST HELPERS
// ═══════════════════════════════════════════════════════

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
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  let submitterRoleId: string | null = null;
  try {
    const submitter = await db.select({ subscriberId: users.subscriberId, role: users.role }).from(users).where(eq(users.id, data.userId)).limit(1);
    if (submitter.length > 0) {
      if (submitter[0].subscriberId) {
        submitterRoleId = submitter[0].subscriberId;
      } else if (submitter[0].role === "subscriber") {
        submitterRoleId = await assignRoleId(data.userId, "subscriber");
      }
    }
  } catch { /* non-blocking */ }
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
    })
    .returning({ insertId: letterRequests.id });
  return result[0];
}

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
  return db
    .select()
    .from(letterRequests)
    .where(
      and(eq(letterRequests.userId, userId), isNull(letterRequests.archivedAt))
    )
    .orderBy(desc(letterRequests.createdAt));
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
      pdfUrl: letterRequests.pdfUrl,
      qualityDegraded: letterRequests.qualityDegraded,
      lastStatusChangedAt: letterRequests.lastStatusChangedAt,
      createdAt: letterRequests.createdAt,
      updatedAt: letterRequests.updatedAt,
    })
    .from(letterRequests)
    .where(and(eq(letterRequests.id, id), eq(letterRequests.userId, userId)))
    .limit(1);
  return result[0];
}

export async function getAllLetterRequests(filters?: {
  status?: string;
  assignedReviewerId?: number | null;
  unassigned?: boolean;
}) {
  const db = await getDb();
  if (!db) return [];
  const conditions = [];
  if (filters?.status)
    conditions.push(eq(letterRequests.status, filters.status as any));
  if (filters?.unassigned)
    conditions.push(isNull(letterRequests.assignedReviewerId));
  else if (
    filters?.assignedReviewerId !== undefined &&
    filters.assignedReviewerId !== null
  )
    conditions.push(
      eq(letterRequests.assignedReviewerId, filters.assignedReviewerId)
    );
  const query = db
    .select()
    .from(letterRequests)
    .orderBy(desc(letterRequests.createdAt));
  if (conditions.length > 0) return query.where(and(...conditions));
  return query;
}

// ─── Valid Status Transitions (state machine) ───
// Single source of truth: shared/types.ts — re-exported here for convenience
import { ALLOWED_TRANSITIONS, isValidTransition } from "../../shared/types";
export { ALLOWED_TRANSITIONS as VALID_TRANSITIONS, isValidTransition };

export async function updateLetterStatus(
  id: number,
  status: string,
  options?: { assignedReviewerId?: number | null; force?: boolean }
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

  if (options?.force) {
    const result = await db
      .update(letterRequests)
      .set(updateData as any)
      .where(eq(letterRequests.id, id))
      .returning({ id: letterRequests.id });
    if (result.length === 0) {
      throw new Error(`Letter ${id} not found`);
    }
    return;
  }

  const allowedFromStatuses = Object.entries(ALLOWED_TRANSITIONS)
    .filter(([, targets]) => targets.includes(status))
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
    .where(
      and(
        eq(letterRequests.id, id),
        or(...statusConditions),
      )
    )
    .returning({ id: letterRequests.id, status: letterRequests.status });

  if (result.length === 0) {
    const letter = await getLetterRequestById(id);
    if (!letter) throw new Error(`Letter ${id} not found`);
    if (letter.status === status) return;
    throw new Error(
      `Invalid status transition: ${letter.status} → ${status}. ` +
        `Allowed from ${letter.status}: [${(ALLOWED_TRANSITIONS[letter.status] ?? []).join(", ")}]`
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

export async function setLetterQualityDegraded(
  id: number,
  degraded: boolean
) {
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
    const reviewer = await db.select({ attorneyId: users.attorneyId, role: users.role }).from(users).where(eq(users.id, reviewerId)).limit(1);
    if (reviewer.length > 0) {
      if (reviewer[0].attorneyId) {
        reviewerRoleId = reviewer[0].attorneyId;
      } else if (reviewer[0].role === "attorney") {
        reviewerRoleId = await assignRoleId(reviewerId, "attorney");
      }
    }
  } catch { /* non-blocking */ }
  const result = await db.update(letterRequests).set({
    assignedReviewerId: reviewerId,
    reviewerRoleId,
    status: "under_review",
    lastStatusChangedAt: new Date(),
    updatedAt: new Date(),
  }).where(
    and(
      eq(letterRequests.id, letterId),
      inArray(letterRequests.status, ["pending_review", "under_review", "client_revision_requested"] as any),
      or(
        isNull(letterRequests.assignedReviewerId),
        eq(letterRequests.assignedReviewerId, reviewerId),
      ),
    )
  ).returning({ id: letterRequests.id });

  if (result.length === 0) {
    // Either letter doesn't exist, was already claimed by someone else, or is in wrong status
    const letter = await getLetterRequestById(letterId);
    if (!letter) throw new Error("Letter not found");
    if (letter.assignedReviewerId && letter.assignedReviewerId !== reviewerId) {
      throw new Error("Letter is already claimed by another reviewer");
    }
    if (letter.status !== "pending_review" && letter.status !== "under_review") {
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

export async function archiveLetterRequest(id: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db
    .update(letterRequests)
    .set({ archivedAt: new Date(), updatedAt: new Date() } as any)
    .where(and(eq(letterRequests.id, id), eq(letterRequests.userId, userId)));
  return result;
}

/**
 * Count how many letters this user has that progressed past the AI pipeline
 * (i.e., reached generated_locked, pending_review, under_review, approved, etc.)
 * Excludes the current letter being processed.
 */
export async function countCompletedLetters(
  userId: number,
  excludeLetterId?: number
): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  // pipeline_failed is included as an "early" (non-completed) status so that
  // a failed first pipeline attempt does not block free-trial eligibility.
  const earlyStatuses = ["submitted", "researching", "drafting", "pipeline_failed"];
  const conditions = [
    eq(letterRequests.userId, userId),
    sql`${letterRequests.status} NOT IN (${sql.join(
      earlyStatuses.map(s => sql`${s}`),
      sql`, `
    )})`,
  ];
  if (excludeLetterId) {
    conditions.push(ne(letterRequests.id, excludeLetterId));
  }
  const result = await db
    .select({ count: sql<number>`count(*)` })
    .from(letterRequests)
    .where(and(...conditions));
  return Number(result[0]?.count ?? 0);
}

/**
 * Check whether a letter was previously unlocked (i.e., it transitioned past
 * generated_locked at some point). This is used by the re-pipeline flow: when
 * a subscriber responds to attorney-requested changes and the pipeline re-runs,
 * the letter should auto-advance to pending_review instead of stopping at
 * generated_locked (which would force a second payment).
 *
 * Checks the review_actions audit log for evidence of prior unlock:
 *   - payment_received (paid unlock via Stripe)
 *   - free_unlock (first-letter free promo)
 *   - Any toStatus of pending_review, under_review, approved, needs_changes
 */
export async function hasLetterBeenPreviouslyUnlocked(
  letterId: number
): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  const result = await db
    .select({ id: reviewActions.id })
    .from(reviewActions)
    .where(
      and(
        eq(reviewActions.letterRequestId, letterId),
        or(
          inArray(reviewActions.action, [
            "payment_received",
            "free_unlock",
          ]),
          inArray(reviewActions.toStatus, [
            "pending_review",
            "under_review",
            "approved",
            "needs_changes",
          ] as any)
        )
      )
    )
    .limit(1);
  return result.length > 0;
}

/**
 * Mark all existing workflow_jobs and research_runs for a letter as superseded.
 * Called before re-running the pipeline so the new run starts fresh and doesn't
 * accidentally reference stale data from a previous attempt.
 */
export async function markPriorPipelineRunsSuperseded(
  letterId: number
): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db
    .update(workflowJobs)
    .set({ status: "failed", errorMessage: JSON.stringify({ code: "SUPERSEDED", message: "Superseded by new pipeline run", stage: "pipeline", category: "permanent" }), updatedAt: new Date() } as any)
    .where(
      and(
        eq(workflowJobs.letterRequestId, letterId),
        inArray(workflowJobs.status, ["queued", "running"] as any)
      )
    );
  await db
    .update(researchRuns)
    .set({ status: "failed", errorMessage: JSON.stringify({ code: "SUPERSEDED", message: "Superseded by new pipeline run", stage: "pipeline", category: "permanent" }), updatedAt: new Date() } as any)
    .where(
      and(
        eq(researchRuns.letterRequestId, letterId),
        inArray(researchRuns.status, ["queued", "running"] as any)
      )
    );
}

