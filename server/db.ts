import { and, desc, eq, inArray, isNull, ne, or, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { captureServerException } from "./sentry";
import type { InsertUser } from "../drizzle/schema";
import {
  attachments,
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
} from "../drizzle/schema";
import type { InsertPipelineLesson, InsertLetterQualityScore } from "../drizzle/schema";

let _db: ReturnType<typeof drizzle> | null = null;
let _startupMigrationRan = false;

export async function getDb() {
  const dbUrl = process.env.SUPABASE_DATABASE_URL || process.env.DATABASE_URL;
  if (!_db && dbUrl) {
    try {
      const client = postgres(dbUrl, {
        ssl: "require",
        max: 10,
        idle_timeout: 20,
        connect_timeout: 10,
      });
      _db = drizzle(client);
      console.log("[Database] Connected to Supabase (PostgreSQL)");
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      captureServerException(error, { tags: { component: "database", error_type: "connection_failed" } });
      _db = null;
    }
  }
  if (_db && !_startupMigrationRan) {
    _startupMigrationRan = true;
    // One-time migration: remove maxUses:1 limit from all existing discount codes
    try {
      await _db
        .update(discountCodes)
        .set({ maxUses: null })
        .where(eq(discountCodes.maxUses, 1));
      console.log("[Database] Migration: cleared maxUses:1 from discount codes");
    } catch (migErr) {
      console.warn("[Database] Migration error (maxUses cleanup):", migErr);
    }
  }
  return _db;
}

// ═══════════════════════════════════════════════════════
// USER HELPERS
// ═══════════════════════════════════════════════════════

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  const values: InsertUser = { openId: user.openId };
  const updateSet: Record<string, unknown> = {};
  const textFields = ["name", "email", "loginMethod"] as const;

  for (const field of textFields) {
    const value = user[field];
    if (value === undefined) continue;
    const normalized = value ?? null;
    values[field] = normalized;
    updateSet[field] = normalized;
  }

  if (user.lastSignedIn !== undefined) {
    values.lastSignedIn = user.lastSignedIn;
    updateSet.lastSignedIn = user.lastSignedIn;
  }
  if (user.role !== undefined) {
    values.role = user.role;
    updateSet.role = user.role;
  } else if (
    process.env.OWNER_OPEN_ID &&
    user.openId === process.env.OWNER_OPEN_ID
  ) {
    values.role = "admin";
    updateSet.role = "admin";
  }
  if (user.emailVerified !== undefined) {
    values.emailVerified = user.emailVerified;
    // Never downgrade emailVerified from true → false on upsert.
    // Once verified, it stays verified regardless of what Supabase reports
    // (e.g. custom-token verification sets our DB to true but Supabase may
    // still show email_confirmed_at = null until the next Supabase-side flow).
    if (user.emailVerified === true) {
      updateSet.emailVerified = true;
    }
    // If incoming is false, we deliberately leave the existing value in place.
  }
  if (user.freeReviewUsedAt !== undefined) {
    values.freeReviewUsedAt = user.freeReviewUsedAt;
    updateSet.freeReviewUsedAt = user.freeReviewUsedAt;
  }
  if (!values.lastSignedIn) values.lastSignedIn = new Date();
  if (Object.keys(updateSet).length === 0) updateSet.lastSignedIn = new Date();

  await db
    .insert(users)
    .values(values)
    .onConflictDoUpdate({ target: users.openId, set: updateSet });
}

export async function setFreeReviewUsed(userId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db
    .update(users)
    .set({ freeReviewUsedAt: new Date() })
    .where(eq(users.id, userId));
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db
    .select()
    .from(users)
    .where(eq(users.openId, openId))
    .limit(1);
  return result[0];
}

export async function getUserById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return result[0];
}

export async function getAllUsers(
  role?: "subscriber" | "employee" | "admin" | "attorney"
) {
  const db = await getDb();
  if (!db) return [];
  if (role)
    return db
      .select()
      .from(users)
      .where(eq(users.role, role))
      .orderBy(desc(users.createdAt));
  return db.select().from(users).orderBy(desc(users.createdAt));
}

export async function getAllUsersWithSubscription(
  role?: "subscriber" | "employee" | "admin" | "attorney"
) {
  const db = await getDb();
  if (!db) return [];
  const query = db
    .select({
      id: users.id,
      openId: users.openId,
      name: users.name,
      email: users.email,
      loginMethod: users.loginMethod,
      role: users.role,
      isActive: users.isActive,
      createdAt: users.createdAt,
      updatedAt: users.updatedAt,
      lastSignedIn: users.lastSignedIn,
      emailVerified: users.emailVerified,
      freeReviewUsedAt: users.freeReviewUsedAt,
      subscriptionStatus: subscriptions.status,
      subscriptionPlan: subscriptions.plan,
    })
    .from(users)
    .leftJoin(subscriptions, eq(subscriptions.userId, users.id))
    .orderBy(desc(users.createdAt));
  if (role) return query.where(eq(users.role, role));
  return query;
}

export async function markAsPaidDb(userId: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const existing = await db
    .select({ id: subscriptions.id })
    .from(subscriptions)
    .where(eq(subscriptions.userId, userId))
    .limit(1);
  if (existing.length > 0) {
    await db
      .update(subscriptions)
      .set({ plan: "monthly_basic", status: "active", updatedAt: new Date() })
      .where(eq(subscriptions.userId, userId));
  } else {
    await db.insert(subscriptions).values({
      userId,
      plan: "monthly_basic",
      status: "active",
      lettersAllowed: 999,
      lettersUsed: 0,
      cancelAtPeriodEnd: false,
    });
  }
}

export async function updateUserRole(
  userId: number,
  role: "subscriber" | "employee" | "admin" | "attorney"
) {
  const db = await getDb();
  if (!db) return;
  await db
    .update(users)
    .set({ role, updatedAt: new Date() })
    .where(eq(users.id, userId));
}

export async function updateUserProfile(
  userId: number,
  data: { name?: string; email?: string }
) {
  const db = await getDb();
  if (!db) return;
  const set: Record<string, unknown> = { updatedAt: new Date() };
  if (data.name !== undefined) set.name = data.name;
  if (data.email !== undefined) set.email = data.email;
  await db
    .update(users)
    .set(set as any)
    .where(eq(users.id, userId));
}

export async function getEmployeesAndAdmins() {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(users)
    .where(inArray(users.role, ["employee", "admin"]))
    .orderBy(users.name);
}

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
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
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
import { ALLOWED_TRANSITIONS, isValidTransition } from "../shared/types";
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

export async function claimLetterForReview(
  letterId: number,
  reviewerId: number
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  // Atomic claim: only succeeds if the letter is unassigned or already claimed
  // by the same reviewer, preventing race conditions between concurrent claims
  const result = await db.update(letterRequests).set({
    assignedReviewerId: reviewerId,
    status: "under_review",
    lastStatusChangedAt: new Date(),
    updatedAt: new Date(),
  }).where(
    and(
      eq(letterRequests.id, letterId),
      inArray(letterRequests.status, ["pending_review", "under_review"] as any),
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
  const earlyStatuses = ["submitted", "researching", "drafting"];
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
    .set({ status: "failed", errorMessage: "Superseded by new pipeline run", updatedAt: new Date() } as any)
    .where(
      and(
        eq(workflowJobs.letterRequestId, letterId),
        inArray(workflowJobs.status, ["queued", "running"] as any)
      )
    );
  await db
    .update(researchRuns)
    .set({ status: "failed", errorMessage: "Superseded by new pipeline run", updatedAt: new Date() } as any)
    .where(
      and(
        eq(researchRuns.letterRequestId, letterId),
        inArray(researchRuns.status, ["queued", "running"] as any)
      )
    );
}

// ═══════════════════════════════════════════════════════
// LETTER VERSION HELPERS
// ═══════════════════════════════════════════════════════

export async function createLetterVersion(data: {
  letterRequestId: number;
  versionType: "ai_draft" | "attorney_edit" | "final_approved";
  content: string;
  createdByType: "system" | "subscriber" | "employee" | "attorney" | "admin";
  createdByUserId?: number;
  metadataJson?: unknown;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db
    .insert(letterVersions)
    .values({
      letterRequestId: data.letterRequestId,
      versionType: data.versionType,
      content: data.content,
      createdByType: data.createdByType,
      createdByUserId: data.createdByUserId,
      metadataJson: data.metadataJson as any,
    })
    .returning({ insertId: letterVersions.id });
  return result[0];
}

export async function getLetterVersionsByRequestId(
  letterRequestId: number,
  includeInternal = false,
  letterStatus?: string
) {
  const db = await getDb();
  if (!db) return [];
  if (includeInternal) {
    return db
      .select()
      .from(letterVersions)
      .where(eq(letterVersions.letterRequestId, letterRequestId))
      .orderBy(desc(letterVersions.createdAt));
  }
  // Subscriber-safe: return final_approved + ai_draft (for generated_locked preview)
  const rows = await db
    .select()
    .from(letterVersions)
    .where(
      and(
        eq(letterVersions.letterRequestId, letterRequestId),
        inArray(letterVersions.versionType, ["final_approved", "ai_draft"])
      )
    )
    .orderBy(desc(letterVersions.createdAt));

  if (letterStatus === "generated_locked") {
    return rows.map((v) => {
      if (v.versionType === "ai_draft" && v.content) {
        return { ...v, content: truncateContent(v.content), truncated: true };
      }
      return { ...v, truncated: false };
    });
  }
  return rows.map((v) => ({ ...v, truncated: false }));
}

function truncateContent(content: string): string {
  const lines = content.split("\n");
  const visibleCount = Math.max(5, Math.floor(lines.length * 0.2));
  return lines.slice(0, visibleCount).join("\n");
}

export async function getLetterVersionById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db
    .select()
    .from(letterVersions)
    .where(eq(letterVersions.id, id))
    .limit(1);
  return result[0];
}

// ═══════════════════════════════════════════════════════
// REVIEW ACTION HELPERS (AUDIT TRAIL)
// ═══════════════════════════════════════════════════════

export async function logReviewAction(data: {
  letterRequestId: number;
  reviewerId?: number;
  actorType: "system" | "subscriber" | "employee" | "attorney" | "admin";
  action: string;
  noteText?: string;
  noteVisibility?: "internal" | "user_visible";
  fromStatus?: string;
  toStatus?: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(reviewActions).values({
    letterRequestId: data.letterRequestId,
    reviewerId: data.reviewerId,
    actorType: data.actorType,
    action: data.action,
    noteText: data.noteText,
    noteVisibility: data.noteVisibility ?? "internal",
    fromStatus: data.fromStatus,
    toStatus: data.toStatus,
  });
}

export async function getReviewActions(
  letterRequestId: number,
  includeInternal = false
) {
  const db = await getDb();
  if (!db) return [];
  if (includeInternal) {
    return db
      .select()
      .from(reviewActions)
      .where(eq(reviewActions.letterRequestId, letterRequestId))
      .orderBy(desc(reviewActions.createdAt));
  }
  // Subscriber-safe: only return user_visible notes
  return db
    .select()
    .from(reviewActions)
    .where(
      and(
        eq(reviewActions.letterRequestId, letterRequestId),
        eq(reviewActions.noteVisibility, "user_visible")
      )
    )
    .orderBy(desc(reviewActions.createdAt));
}

// ═══════════════════════════════════════════════════════
// WORKFLOW JOB HELPERS
// ═══════════════════════════════════════════════════════

export async function createWorkflowJob(data: {
  letterRequestId: number;
  jobType: "research" | "draft_generation" | "generation_pipeline" | "retry" | "vetting";
  provider?: string;
  requestPayloadJson?: unknown;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db
    .insert(workflowJobs)
    .values({
      letterRequestId: data.letterRequestId,
      jobType: data.jobType,
      provider: data.provider,
      status: "queued",
      attemptCount: 0,
      requestPayloadJson: data.requestPayloadJson as any,
    })
    .returning({ insertId: workflowJobs.id });
  return result[0];
}

export async function updateWorkflowJob(
  id: number,
  data: {
    status?: "queued" | "running" | "completed" | "failed";
    errorMessage?: string;
    responsePayloadJson?: unknown;
    startedAt?: Date;
    completedAt?: Date;
    attemptCount?: number;
  }
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db
    .update(workflowJobs)
    .set({
      ...data,
      responsePayloadJson: data.responsePayloadJson as any,
      updatedAt: new Date(),
    } as any)
    .where(eq(workflowJobs.id, id));
}

export async function getWorkflowJobsByLetterId(letterRequestId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(workflowJobs)
    .where(eq(workflowJobs.letterRequestId, letterRequestId))
    .orderBy(desc(workflowJobs.createdAt));
}

export async function getFailedJobs(limit = 50) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(workflowJobs)
    .where(eq(workflowJobs.status, "failed"))
    .orderBy(desc(workflowJobs.createdAt))
    .limit(limit);
}

export async function getWorkflowJobById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db
    .select()
    .from(workflowJobs)
    .where(eq(workflowJobs.id, id))
    .limit(1);
  return result[0];
}

export async function purgeFailedJobs(): Promise<{ deletedCount: number }> {
  const db = await getDb();
  if (!db) return { deletedCount: 0 };
  // Get count before deleting
  const failed = await db
    .select({ id: workflowJobs.id })
    .from(workflowJobs)
    .where(eq(workflowJobs.status, "failed"));
  if (failed.length === 0) return { deletedCount: 0 };
  await db.delete(workflowJobs).where(eq(workflowJobs.status, "failed"));
  return { deletedCount: failed.length };
}

// ═══════════════════════════════════════════════════════
// RESEARCH RUN HELPERS
// ═══════════════════════════════════════════════════════

export async function createResearchRun(data: {
  letterRequestId: number;
  workflowJobId?: number;
  provider?: string;
  queryPlanJson?: unknown;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db
    .insert(researchRuns)
    .values({
      letterRequestId: data.letterRequestId,
      workflowJobId: data.workflowJobId,
      provider: data.provider ?? "perplexity",
      status: "queued",
      queryPlanJson: data.queryPlanJson as any,
    })
    .returning({ insertId: researchRuns.id });
  return result[0];
}

export async function updateResearchRun(
  id: number,
  data: {
    status?: "queued" | "running" | "completed" | "failed" | "invalid";
    resultJson?: unknown;
    validationResultJson?: unknown;
    errorMessage?: string;
  }
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db
    .update(researchRuns)
    .set({
      ...data,
      resultJson: data.resultJson as any,
      validationResultJson: data.validationResultJson as any,
      updatedAt: new Date(),
    } as any)
    .where(eq(researchRuns.id, id));
}

export async function getResearchRunsByLetterId(letterRequestId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(researchRuns)
    .where(eq(researchRuns.letterRequestId, letterRequestId))
    .orderBy(desc(researchRuns.createdAt));
}

export async function getLatestResearchRun(letterRequestId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db
    .select()
    .from(researchRuns)
    .where(
      and(
        eq(researchRuns.letterRequestId, letterRequestId),
        eq(researchRuns.status, "completed")
      )
    )
    .orderBy(desc(researchRuns.createdAt))
    .limit(1);
  return result[0];
}

// ═══════════════════════════════════════════════════════
// ATTACHMENT HELPERS
// ═══════════════════════════════════════════════════════

export async function createAttachment(data: {
  letterRequestId: number;
  uploadedByUserId: number;
  storagePath: string;
  storageUrl?: string;
  fileName: string;
  mimeType?: string;
  sizeBytes?: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db
    .insert(attachments)
    .values(data)
    .returning({ insertId: attachments.id });
  return result[0];
}

export async function getAttachmentsByLetterId(letterRequestId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(attachments)
    .where(eq(attachments.letterRequestId, letterRequestId))
    .orderBy(attachments.createdAt);
}

// ═══════════════════════════════════════════════════════
// NOTIFICATION HELPERS
// ═══════════════════════════════════════════════════════

export async function createNotification(data: {
  userId: number;
  type: string;
  title: string;
  body?: string;
  link?: string;
  category?: string;
  metadataJson?: unknown;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(notifications).values({
    userId: data.userId,
    type: data.type,
    category: data.category ?? "general",
    title: data.title,
    body: data.body,
    link: data.link,
    metadataJson: data.metadataJson as any,
  });
}

export type NotificationCategory = "users" | "letters" | "employee" | "general";

export async function notifyAdmins(opts: {
  category: NotificationCategory;
  type: string;
  title: string;
  body?: string;
  link?: string;
  emailOpts?: {
    subject: string;
    preheader: string;
    bodyHtml: string;
    ctaText?: string;
    ctaUrl?: string;
  };
}) {
  try {
    const admins = await getAllUsers("admin");
    for (const admin of admins) {
      await createNotification({
        userId: admin.id,
        type: opts.type,
        category: opts.category,
        title: opts.title,
        body: opts.body,
        link: opts.link,
      });
      if (opts.emailOpts && admin.email) {
        const { sendAdminAlertEmail } = await import("./email");
        await sendAdminAlertEmail({
          to: admin.email,
          name: admin.name ?? "Admin",
          ...opts.emailOpts,
        }).catch((err: unknown) =>
          console.error(`[notifyAdmins] Email to ${admin.email} failed:`, err)
        );
      }
    }
  } catch (err) {
    console.error("[notifyAdmins] Failed:", err);
    captureServerException(err, { tags: { component: "notifications", error_type: "notify_admins_failed" } });
  }
}

export async function getNotificationsByUserId(
  userId: number,
  unreadOnly = false
) {
  const db = await getDb();
  if (!db) return [];
  if (unreadOnly) {
    return db
      .select()
      .from(notifications)
      .where(
        and(eq(notifications.userId, userId), isNull(notifications.readAt))
      )
      .orderBy(desc(notifications.createdAt))
      .limit(50);
  }
  return db
    .select()
    .from(notifications)
    .where(eq(notifications.userId, userId))
    .orderBy(desc(notifications.createdAt))
    .limit(50);
}

export async function markNotificationRead(id: number, userId: number) {
  const db = await getDb();
  if (!db) return;
  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(and(eq(notifications.id, id), eq(notifications.userId, userId)));
}

export async function markAllNotificationsRead(userId: number) {
  const db = await getDb();
  if (!db) return;
  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
}

// ═══════════════════════════════════════════════════════
// ADMIN STATS HELPERS
// ═══════════════════════════════════════════════════════

export async function getSystemStats() {
  const db = await getDb();
  if (!db) return null;

  // Core counts
  const [totalLetters] = await db
    .select({ count: sql<number>`count(*)` })
    .from(letterRequests);
  const [pendingReview] = await db
    .select({ count: sql<number>`count(*)` })
    .from(letterRequests)
    .where(
      inArray(letterRequests.status, ["pending_review", "under_review"] as any)
    );
  const [approved] = await db
    .select({ count: sql<number>`count(*)` })
    .from(letterRequests)
    .where(eq(letterRequests.status, "approved" as any));
  const [failedJobs] = await db
    .select({ count: sql<number>`count(*)` })
    .from(workflowJobs)
    .where(eq(workflowJobs.status, "failed"));
  const [totalUsers] = await db
    .select({ count: sql<number>`count(*)` })
    .from(users);

  // User counts by role
  const roleCounts = await db
    .select({ role: users.role, count: sql<number>`count(*)` })
    .from(users)
    .groupBy(users.role);
  const byRole: Record<string, number> = {};
  for (const r of roleCounts) {
    byRole[r.role] = Number(r.count);
  }

  // Letter counts by status
  const statusCounts = await db
    .select({ status: letterRequests.status, count: sql<number>`count(*)` })
    .from(letterRequests)
    .groupBy(letterRequests.status);
  const byStatus: Record<string, number> = {};
  for (const s of statusCounts) {
    byStatus[s.status] = Number(s.count);
  }

  // Revenue: total commission amounts
  const [totalCommissions] = await db
    .select({ total: sql<number>`COALESCE(SUM(commission_amount), 0)` })
    .from(commissionLedger);
  const [pendingCommissions] = await db
    .select({ total: sql<number>`COALESCE(SUM(commission_amount), 0)` })
    .from(commissionLedger)
    .where(eq(commissionLedger.status, "pending"));
  const [totalSalesAmount] = await db
    .select({ total: sql<number>`COALESCE(SUM(sale_amount), 0)` })
    .from(commissionLedger);

  // Active subscriptions count
  const [activeSubscriptions] = await db
    .select({ count: sql<number>`count(*)` })
    .from(subscriptions)
    .where(eq(subscriptions.status, "active" as any));

  // Letters created in last 30 days
  const [recentLetters] = await db
    .select({ count: sql<number>`count(*)` })
    .from(letterRequests)
    .where(sql`${letterRequests.createdAt} > NOW() - INTERVAL '30 days'`);

  return {
    totalLetters: Number(totalLetters?.count ?? 0),
    pendingReview: Number(pendingReview?.count ?? 0),
    approvedLetters: Number(approved?.count ?? 0),
    failedJobs: Number(failedJobs?.count ?? 0),
    totalUsers: Number(totalUsers?.count ?? 0),
    subscribers: Number(byRole.subscriber ?? 0),
    attorneys: Number(byRole.attorney ?? 0),
    employees: Number(byRole.employee ?? 0),
    admins: Number(byRole.admin ?? 0),
    byRole,
    byStatus,
    revenue: {
      totalSales: Number(totalSalesAmount?.total ?? 0),
      totalCommissions: Number(totalCommissions?.total ?? 0),
      pendingCommissions: Number(pendingCommissions?.total ?? 0),
    },
    activeSubscriptions: Number(activeSubscriptions?.count ?? 0),
    recentLetters: Number(recentLetters?.count ?? 0),
  };
}

// ═══════════════════════════════════════════════════════
// DISCOUNT CODE HELPERS
// ═══════════════════════════════════════════════════════

function generateDiscountCode(employeeName: string): string {
  const prefix = (employeeName || "EMP")
    .toUpperCase()
    .replace(/[^A-Z]/g, "")
    .slice(0, 4);
  const suffix = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `${prefix}-${suffix}`;
}

export async function createDiscountCodeForEmployee(
  employeeId: number,
  employeeName: string
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  // Check if employee already has a code
  const existing = await db
    .select()
    .from(discountCodes)
    .where(eq(discountCodes.employeeId, employeeId))
    .limit(1);
  if (existing.length > 0) return existing[0];
  const code = generateDiscountCode(employeeName);
  const result = await db
    .insert(discountCodes)
    .values({
      employeeId,
      code,
      discountPercent: 20,
      isActive: true,
      usageCount: 0,
      maxUses: null,
    })
    .returning();
  return result[0];
}

export async function rotateDiscountCode(
  employeeId: number,
  employeeName: string
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const newCode = generateDiscountCode(employeeName);
  const result = await db
    .update(discountCodes)
    .set({
      code: newCode,
      usageCount: 0,
      maxUses: null,
      updatedAt: new Date(),
    })
    .where(eq(discountCodes.employeeId, employeeId))
    .returning();
  return result[0];
}

export async function getDiscountCodeByEmployeeId(employeeId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db
    .select()
    .from(discountCodes)
    .where(eq(discountCodes.employeeId, employeeId))
    .limit(1);
  return result[0];
}

export async function getDiscountCodeByCode(code: string) {
  const db = await getDb();
  if (!db) return undefined;
  const normalizedCode = code.trim().toUpperCase();
  const result = await db
    .select()
    .from(discountCodes)
    .where(eq(discountCodes.code, normalizedCode))
    .limit(1);
  return result[0];
}

export async function incrementDiscountCodeUsage(codeId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db
    .update(discountCodes)
    .set({
      usageCount: sql`${discountCodes.usageCount} + 1`,
      updatedAt: new Date(),
    })
    .where(eq(discountCodes.id, codeId));
}

export async function getAllDiscountCodes() {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({
      id: discountCodes.id,
      employeeId: discountCodes.employeeId,
      code: discountCodes.code,
      discountPercent: discountCodes.discountPercent,
      isActive: discountCodes.isActive,
      usageCount: discountCodes.usageCount,
      maxUses: discountCodes.maxUses,
      expiresAt: discountCodes.expiresAt,
      createdAt: discountCodes.createdAt,
      updatedAt: discountCodes.updatedAt,
      employeeName: users.name,
      employeeEmail: users.email,
    })
    .from(discountCodes)
    .leftJoin(users, eq(discountCodes.employeeId, users.id))
    .orderBy(desc(discountCodes.createdAt));
}

export async function updateDiscountCode(
  id: number,
  data: {
    isActive?: boolean;
    discountPercent?: number;
    maxUses?: number | null;
  }
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db
    .update(discountCodes)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(discountCodes.id, id));
}

// ═══════════════════════════════════════════════════════
// COMMISSION LEDGER HELPERS
// ═══════════════════════════════════════════════════════

export async function createCommission(data: {
  employeeId: number;
  letterRequestId?: number;
  subscriberId?: number;
  discountCodeId?: number;
  stripePaymentIntentId?: string;
  saleAmount: number; // cents
  commissionRate?: number; // basis points, default 500 = 5%
  commissionAmount: number; // cents
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // ─── Idempotency: prevent duplicate commissions for the same Stripe payment ───
  if (data.stripePaymentIntentId) {
    const existing = await db
      .select({ id: commissionLedger.id })
      .from(commissionLedger)
      .where(
        eq(commissionLedger.stripePaymentIntentId, data.stripePaymentIntentId)
      )
      .limit(1);
    if (existing.length > 0) {
      console.log(
        `[Commission] Duplicate prevented: commission already exists for PI ${data.stripePaymentIntentId}`
      );
      return existing[0];
    }
  }

  const result = await db
    .insert(commissionLedger)
    .values({
      employeeId: data.employeeId,
      letterRequestId: data.letterRequestId,
      subscriberId: data.subscriberId,
      discountCodeId: data.discountCodeId,
      stripePaymentIntentId: data.stripePaymentIntentId,
      saleAmount: data.saleAmount,
      commissionRate: data.commissionRate ?? 500,
      commissionAmount: data.commissionAmount,
      status: "pending",
    })
    .returning({ insertId: commissionLedger.id });
  return result[0];
}

export async function getCommissionsByEmployeeId(employeeId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(commissionLedger)
    .where(eq(commissionLedger.employeeId, employeeId))
    .orderBy(desc(commissionLedger.createdAt));
}

export async function getEmployeeEarningsSummary(employeeId: number) {
  const db = await getDb();
  if (!db) return { totalEarned: 0, pending: 0, paid: 0, referralCount: 0 };
  const all = await db
    .select({
      status: commissionLedger.status,
      amount: commissionLedger.commissionAmount,
    })
    .from(commissionLedger)
    .where(eq(commissionLedger.employeeId, employeeId));
  let totalEarned = 0,
    pending = 0,
    paid = 0;
  for (const row of all) {
    if (row.status === "voided") continue;
    totalEarned += row.amount;
    if (row.status === "pending") pending += row.amount;
    if (row.status === "paid") paid += row.amount;
  }
  const referralCount = all.filter(r => r.status !== "voided").length;
  return { totalEarned, pending, paid, referralCount };
}

/** Batch version: returns earnings summary for ALL employees in a single query.
 *  Used by adminEmployeePerformance to avoid N+1 queries. */
export async function getAllEmployeeEarnings(): Promise<
  Array<{
    employeeId: number;
    totalEarned: number;
    pending: number;
    paid: number;
    referralCount: number;
  }>
> {
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .select({
      employeeId: commissionLedger.employeeId,
      status: commissionLedger.status,
      amount: commissionLedger.commissionAmount,
    })
    .from(commissionLedger);

  // Aggregate in memory, grouped by employeeId
  const map = new Map<
    number,
    {
      totalEarned: number;
      pending: number;
      paid: number;
      referralCount: number;
    }
  >();
  for (const row of rows) {
    if (row.status === "voided") continue;
    const empId = row.employeeId;
    if (empId == null) continue;
    let entry = map.get(empId);
    if (!entry) {
      entry = { totalEarned: 0, pending: 0, paid: 0, referralCount: 0 };
      map.set(empId, entry);
    }
    entry.totalEarned += row.amount;
    if (row.status === "pending") entry.pending += row.amount;
    if (row.status === "paid") entry.paid += row.amount;
    entry.referralCount += 1;
  }

  return Array.from(map.entries()).map(([employeeId, data]) => ({
    employeeId,
    ...data,
  }));
}

export async function getAllCommissions() {
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .select({
      id: commissionLedger.id,
      employeeId: commissionLedger.employeeId,
      letterRequestId: commissionLedger.letterRequestId,
      subscriberId: commissionLedger.subscriberId,
      discountCodeId: commissionLedger.discountCodeId,
      stripePaymentIntentId: commissionLedger.stripePaymentIntentId,
      saleAmount: commissionLedger.saleAmount,
      commissionRate: commissionLedger.commissionRate,
      commissionAmount: commissionLedger.commissionAmount,
      status: commissionLedger.status,
      paidAt: commissionLedger.paidAt,
      createdAt: commissionLedger.createdAt,
      employeeName: users.name,
      employeeEmail: users.email,
    })
    .from(commissionLedger)
    .leftJoin(users, eq(commissionLedger.employeeId, users.id))
    .orderBy(desc(commissionLedger.createdAt));
  return rows;
}

export async function markCommissionsPaid(commissionIds: number[]) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db
    .update(commissionLedger)
    .set({
      status: "paid",
      paidAt: new Date(),
    })
    .where(inArray(commissionLedger.id, commissionIds));
}

// ═══════════════════════════════════════════════════════
// PAYOUT REQUEST HELPERS
// ═══════════════════════════════════════════════════════

export async function createPayoutRequest(data: {
  employeeId: number;
  amount: number; // cents
  paymentMethod?: string;
  paymentDetails?: unknown;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db
    .insert(payoutRequests)
    .values({
      employeeId: data.employeeId,
      amount: data.amount,
      paymentMethod: data.paymentMethod ?? "bank_transfer",
      paymentDetails: data.paymentDetails as any,
      status: "pending",
    })
    .returning({ insertId: payoutRequests.id });
  return result[0];
}

export async function getPayoutRequestsByEmployeeId(employeeId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(payoutRequests)
    .where(eq(payoutRequests.employeeId, employeeId))
    .orderBy(desc(payoutRequests.createdAt));
}

export async function getAllPayoutRequests() {
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .select({
      id: payoutRequests.id,
      employeeId: payoutRequests.employeeId,
      amount: payoutRequests.amount,
      paymentMethod: payoutRequests.paymentMethod,
      paymentDetails: payoutRequests.paymentDetails,
      status: payoutRequests.status,
      processedAt: payoutRequests.processedAt,
      processedBy: payoutRequests.processedBy,
      rejectionReason: payoutRequests.rejectionReason,
      createdAt: payoutRequests.createdAt,
      updatedAt: payoutRequests.updatedAt,
      employeeName: users.name,
      employeeEmail: users.email,
    })
    .from(payoutRequests)
    .leftJoin(users, eq(payoutRequests.employeeId, users.id))
    .orderBy(desc(payoutRequests.createdAt));
  return rows;
}

export async function processPayoutRequest(
  id: number,
  processedBy: number,
  action: "completed" | "rejected",
  rejectionReason?: string
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const updateData: Record<string, unknown> = {
    status: action,
    processedAt: new Date(),
    processedBy,
    updatedAt: new Date(),
  };
  if (action === "rejected" && rejectionReason) {
    updateData.rejectionReason = rejectionReason;
  }
  await db
    .update(payoutRequests)
    .set(updateData as any)
    .where(eq(payoutRequests.id, id));
}

export async function getPayoutRequestById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db
    .select()
    .from(payoutRequests)
    .where(eq(payoutRequests.id, id))
    .limit(1);
  return result[0];
}

// ─── Email Verification Token Helpers ────────────────────────────────────────

/** Create a new email verification token (24h expiry) */
export async function createEmailVerificationToken(
  userId: number,
  email: string,
  token: string
) {
  const db = await getDb();
  if (!db) return;
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
  await db
    .insert(emailVerificationTokens)
    .values({ userId, email, token, expiresAt });
}

/** Find a valid (unused, unexpired) verification token */
export async function findValidVerificationToken(token: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db
    .select()
    .from(emailVerificationTokens)
    .where(
      and(
        eq(emailVerificationTokens.token, token),
        isNull(emailVerificationTokens.usedAt),
        sql`${emailVerificationTokens.expiresAt} > now()`
      )
    )
    .limit(1);
  return result[0];
}

/** Mark a verification token as used and mark the user as verified.
 * Returns the token record (with userId and email) on success, or null if invalid/expired.
 */
export async function consumeVerificationToken(token: string) {
  const db = await getDb();
  if (!db) return null;
  const record = await findValidVerificationToken(token);
  if (!record) return null;
  // Mark token as used
  await db
    .update(emailVerificationTokens)
    .set({ usedAt: new Date() })
    .where(eq(emailVerificationTokens.token, token));
  // Mark user as verified
  await db
    .update(users)
    .set({ emailVerified: true, updatedAt: new Date() })
    .where(eq(users.id, record.userId));
  return record; // { userId, email, ... }
}

/** Delete any existing unused tokens for a user (before issuing a new one) */
export async function deleteUserVerificationTokens(userId: number) {
  const db = await getDb();
  if (!db) return;
  await db
    .delete(emailVerificationTokens)
    .where(
      and(
        eq(emailVerificationTokens.userId, userId),
        isNull(emailVerificationTokens.usedAt)
      )
    );
}

/** Check if a user's email is verified */
export async function isUserEmailVerified(userId: number): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  const result = await db
    .select({ emailVerified: users.emailVerified })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return result[0]?.emailVerified ?? false;
}

/** Look up a user by email address */
export async function getUserByEmail(email: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  return result[0];
}

// ═══════════════════════════════════════════════════════
// PIPELINE LESSONS HELPERS (Recursive Learning)
// ═══════════════════════════════════════════════════════

export async function createPipelineLesson(data: InsertPipelineLesson) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db
    .insert(pipelineLessons)
    .values(data)
    .returning({ insertId: pipelineLessons.id });
  return result[0];
}

export async function getActiveLessons(filters: {
  letterType?: string;
  jurisdiction?: string;
  pipelineStage?: string;
  limit?: number;
}) {
  const db = await getDb();
  if (!db) return [];
  const conditions = [eq(pipelineLessons.isActive, true)];
  if (filters.letterType) {
    conditions.push(
      or(
        eq(pipelineLessons.letterType, filters.letterType as NonNullable<InsertPipelineLesson["letterType"]>),
        isNull(pipelineLessons.letterType),
      )!
    );
  }
  if (filters.jurisdiction) {
    conditions.push(
      or(
        eq(pipelineLessons.jurisdiction, filters.jurisdiction),
        isNull(pipelineLessons.jurisdiction),
      )!
    );
  }
  if (filters.pipelineStage) {
    conditions.push(
      or(
        eq(pipelineLessons.pipelineStage, filters.pipelineStage as NonNullable<InsertPipelineLesson["pipelineStage"]>),
        isNull(pipelineLessons.pipelineStage),
      )!
    );
  }
  return db
    .select()
    .from(pipelineLessons)
    .where(and(...conditions))
    .orderBy(desc(pipelineLessons.weight))
    .limit(filters.limit ?? 10);
}

export async function getAllLessons(filters?: {
  letterType?: string;
  jurisdiction?: string;
  pipelineStage?: string;
  isActive?: boolean;
}) {
  const db = await getDb();
  if (!db) return [];
  const conditions: ReturnType<typeof eq>[] = [];
  if (filters?.letterType) conditions.push(eq(pipelineLessons.letterType, filters.letterType as NonNullable<InsertPipelineLesson["letterType"]>));
  if (filters?.jurisdiction) conditions.push(eq(pipelineLessons.jurisdiction, filters.jurisdiction));
  if (filters?.pipelineStage) conditions.push(eq(pipelineLessons.pipelineStage, filters.pipelineStage as NonNullable<InsertPipelineLesson["pipelineStage"]>));
  if (filters?.isActive !== undefined) conditions.push(eq(pipelineLessons.isActive, filters.isActive));
  const query = db.select().from(pipelineLessons).orderBy(desc(pipelineLessons.createdAt));
  if (conditions.length > 0) return query.where(and(...conditions));
  return query;
}

export async function getLessonById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(pipelineLessons).where(eq(pipelineLessons.id, id)).limit(1);
  return result[0];
}

export async function updatePipelineLesson(id: number, data: {
  lessonText?: string;
  category?: string;
  letterType?: string | null;
  jurisdiction?: string | null;
  pipelineStage?: string | null;
  isActive?: boolean;
  weight?: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db
    .update(pipelineLessons)
    .set({ ...data, updatedAt: new Date() } as any)
    .where(eq(pipelineLessons.id, id));
}

export async function deletePipelineLesson(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(pipelineLessons).where(eq(pipelineLessons.id, id));
}

// ═══════════════════════════════════════════════════════
// LETTER QUALITY SCORES HELPERS
// ═══════════════════════════════════════════════════════

export async function createLetterQualityScore(data: InsertLetterQualityScore) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db
    .insert(letterQualityScores)
    .values(data)
    .onConflictDoUpdate({
      target: letterQualityScores.letterRequestId,
      set: {
        firstPassApproved: data.firstPassApproved,
        revisionCount: data.revisionCount,
        vettingPassCount: data.vettingPassCount,
        vettingFailCount: data.vettingFailCount,
        attorneyEditDistance: data.attorneyEditDistance,
        timeToFirstReviewMs: data.timeToFirstReviewMs,
        timeToApprovalMs: data.timeToApprovalMs,
        computedScore: data.computedScore,
      } as any,
    })
    .returning({ insertId: letterQualityScores.id });
  return result[0];
}

export async function getQualityScoreByLetterId(letterRequestId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db
    .select()
    .from(letterQualityScores)
    .where(eq(letterQualityScores.letterRequestId, letterRequestId))
    .limit(1);
  return result[0];
}

export async function getQualityScoreStats() {
  const db = await getDb();
  if (!db) return null;
  const result = await db.execute(sql`
    SELECT
      COUNT(*)::int as "totalScored",
      ROUND(AVG(CASE WHEN first_pass_approved THEN 100 ELSE 0 END), 1) as "firstPassRate",
      ROUND(AVG(revision_count), 1) as "avgRevisions",
      ROUND(AVG(computed_score), 1) as "avgScore",
      ROUND(AVG(attorney_edit_distance), 1) as "avgEditDistance",
      ROUND(AVG(vetting_pass_count), 1) as "avgVettingPasses",
      ROUND(AVG(vetting_fail_count), 1) as "avgVettingFails"
    FROM letter_quality_scores
  `);
  return result[0];
}

export async function getQualityScoresByLetterType() {
  const db = await getDb();
  if (!db) return [];
  return db.execute(sql`
    SELECT
      lr.letter_type as "letterType",
      COUNT(*)::int as "total",
      ROUND(AVG(CASE WHEN lqs.first_pass_approved THEN 100 ELSE 0 END), 1) as "firstPassRate",
      ROUND(AVG(lqs.revision_count), 1) as "avgRevisions",
      ROUND(AVG(lqs.computed_score), 1) as "avgScore"
    FROM letter_quality_scores lqs
    JOIN letter_requests lr ON lqs.letter_request_id = lr.id
    GROUP BY lr.letter_type
    ORDER BY "total" DESC
  `);
}

export async function getQualityScoreTrend(days: number = 30) {
  const db = await getDb();
  if (!db) return [];
  return db.execute(sql`
    SELECT
      DATE_TRUNC('day', lqs.created_at)::text as "date",
      COUNT(*)::int as "count",
      ROUND(AVG(CASE WHEN lqs.first_pass_approved THEN 100 ELSE 0 END), 1) as "firstPassRate",
      ROUND(AVG(lqs.computed_score), 1) as "avgScore"
    FROM letter_quality_scores lqs
    WHERE lqs.created_at >= NOW() - INTERVAL '1 day' * ${days}
    GROUP BY DATE_TRUNC('day', lqs.created_at)
    ORDER BY "date" ASC
  `);
}
