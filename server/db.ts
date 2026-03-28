import { and, desc, eq, inArray, isNull, lt, ne, or, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { captureServerException } from "./sentry";
import type { InsertUser } from "../drizzle/schema";
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
    // Add pipeline_locked_at column if it doesn't exist (session locking feature)
    try {
      await _db.execute(sql`
        ALTER TABLE letter_requests
        ADD COLUMN IF NOT EXISTS pipeline_locked_at TIMESTAMPTZ
      `);
      console.log("[Database] Migration: ensured pipeline_locked_at column exists");
    } catch (migErr) {
      console.warn("[Database] Migration error (pipeline_locked_at):", migErr);
    }
    // Add recursive learning hardening columns to pipeline_lessons
    try {
      await _db.execute(sql`
        ALTER TABLE pipeline_lessons
        ADD COLUMN IF NOT EXISTS hit_count INTEGER NOT NULL DEFAULT 1,
        ADD COLUMN IF NOT EXISTS times_injected INTEGER NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS consolidated_from_ids INTEGER[],
        ADD COLUMN IF NOT EXISTS letters_before_avg_score INTEGER,
        ADD COLUMN IF NOT EXISTS letters_after_avg_score INTEGER,
        ADD COLUMN IF NOT EXISTS effectiveness_samples INTEGER NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS last_injected_at TIMESTAMPTZ
      `);
      await _db.execute(sql`
        CREATE INDEX IF NOT EXISTS idx_pipeline_lessons_type_jurisdiction_active
        ON pipeline_lessons (letter_type, jurisdiction, is_active)
      `);
      console.log("[Database] Migration: ensured pipeline_lessons hardening columns exist");
    } catch (migErr) {
      console.warn("[Database] Migration error (pipeline_lessons hardening):", migErr);
    }
    // Add 'consolidation' to lesson_source enum if it doesn't exist
    try {
      await _db.execute(sql`
        DO $$ BEGIN
          ALTER TYPE lesson_source ADD VALUE IF NOT EXISTS 'consolidation';
        EXCEPTION
          WHEN duplicate_object THEN NULL;
        END $$
      `);
      console.log("[Database] Migration: ensured 'consolidation' enum value exists");
    } catch (migErr) {
      console.warn("[Database] Migration error (consolidation enum):", migErr);
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

/**
 * Atomically claim the free trial slot for a user.
 * Uses a conditional UPDATE (WHERE freeReviewUsedAt IS NULL) to ensure
 * only one concurrent submission can claim the slot. Returns true if the
 * claim succeeded (slot was available), false if already claimed.
 */
export async function claimFreeTrialSlot(userId: number): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  const result = await db
    .update(users)
    .set({ freeReviewUsedAt: new Date() })
    .where(and(eq(users.id, userId), isNull(users.freeReviewUsedAt)))
    .returning({ id: users.id });
  return result.length > 0;
}

/**
 * Restore a previously claimed free trial slot (on pipeline failure).
 * Only clears the freeReviewUsedAt marker if the user still has no
 * completed/unlocked letters (to avoid refunding legitimate usage).
 */
export async function refundFreeTrialSlot(userId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const earlyStatuses = ["submitted", "researching", "drafting", "pipeline_failed"];
  const completedCount = await db
    .select({ count: sql<number>`count(*)` })
    .from(letterRequests)
    .where(
      and(
        eq(letterRequests.userId, userId),
        sql`${letterRequests.status} NOT IN (${sql.join(
          earlyStatuses.map(s => sql`${s}`),
          sql`, `
        )})`
      )
    );
  if (Number(completedCount[0]?.count ?? 0) === 0) {
    await db
      .update(users)
      .set({ freeReviewUsedAt: null })
      .where(eq(users.id, userId));
  }
}

/**
 * Atomically decrement lettersUsed for a paid subscriber (usage refund on pipeline failure).
 * Only decrements if lettersUsed > 0 to prevent going negative.
 */
export async function decrementLettersUsed(userId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db
    .update(subscriptions)
    .set({ lettersUsed: sql`GREATEST(${subscriptions.lettersUsed} - 1, 0)` })
    .where(
      and(
        eq(subscriptions.userId, userId),
        sql`${subscriptions.lettersUsed} > 0`
      )
    );
}

/**
 * Attempt to acquire a DB-level pipeline execution lock for a letter.
 * Uses a conditional UPDATE: sets pipeline_locked_at only when the column
 * is NULL or the lock is stale (older than LOCK_STALE_MS).
 * Returns true if the lock was acquired, false if another process holds it.
 */
const PIPELINE_LOCK_STALE_MS = 30 * 60 * 1000; // 30 minutes

export async function acquirePipelineLock(letterId: number): Promise<boolean> {
  const db = await getDb();
  if (!db) return false; // fail closed — no lock without DB
  const staleThreshold = new Date(Date.now() - PIPELINE_LOCK_STALE_MS);
  const result = await db
    .update(letterRequests)
    .set({ pipelineLockedAt: new Date() })
    .where(
      and(
        eq(letterRequests.id, letterId),
        or(
          isNull(letterRequests.pipelineLockedAt),
          lt(letterRequests.pipelineLockedAt, staleThreshold)
        )
      )
    )
    .returning({ id: letterRequests.id });
  return result.length > 0;
}

/**
 * Release the pipeline execution lock for a letter.
 */
export async function releasePipelineLock(letterId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db
    .update(letterRequests)
    .set({ pipelineLockedAt: null })
    .where(eq(letterRequests.id, letterId));
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
      subscriberId: users.subscriberId,
      employeeId: users.employeeId,
      attorneyId: users.attorneyId,
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
    promptTokens?: number;
    completionTokens?: number;
    estimatedCostUsd?: string;
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
    cacheHit?: boolean;
    cacheKey?: string;
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

export async function getCostAnalytics() {
  const db = await getDb();
  if (!db) return null;

  // Aggregate all jobs where cost was tracked (IS NOT NULL), regardless of status,
  // so failed jobs that still incurred API charges are reflected in total spend.
  const hasCost = sql`estimated_cost_usd IS NOT NULL`;

  const [totalCost] = await db
    .select({ total: sql<number>`COALESCE(SUM(estimated_cost_usd::numeric), 0)` })
    .from(workflowJobs)
    .where(hasCost);

  const [letterCount] = await db
    .select({ count: sql<number>`COUNT(DISTINCT letter_request_id)` })
    .from(workflowJobs)
    .where(hasCost);

  const [totalTokens] = await db
    .select({
      promptTokens: sql<number>`COALESCE(SUM(prompt_tokens), 0)`,
      completionTokens: sql<number>`COALESCE(SUM(completion_tokens), 0)`,
    })
    .from(workflowJobs)
    .where(hasCost);

  const costByDay = await db
    .select({
      date: sql<string>`DATE(COALESCE(completed_at, created_at))`,
      cost: sql<number>`COALESCE(SUM(estimated_cost_usd::numeric), 0)`,
      letters: sql<number>`COUNT(DISTINCT letter_request_id)`,
    })
    .from(workflowJobs)
    .where(
      and(
        hasCost,
        sql`COALESCE(completed_at, created_at) > NOW() - INTERVAL '30 days'`
      )
    )
    .groupBy(sql`DATE(COALESCE(completed_at, created_at))`)
    .orderBy(sql`DATE(COALESCE(completed_at, created_at))`);

  const totalSpend = Number(totalCost?.total ?? 0);
  const lettersWithCost = Number(letterCount?.count ?? 0);

  return {
    totalSpend,
    avgCostPerLetter: lettersWithCost > 0 ? totalSpend / lettersWithCost : 0,
    lettersWithCost,
    totalPromptTokens: Number(totalTokens?.promptTokens ?? 0),
    totalCompletionTokens: Number(totalTokens?.completionTokens ?? 0),
    costByDay: costByDay.map(d => ({
      date: d.date,
      cost: Number(d.cost),
      letters: Number(d.letters),
    })),
  };
}

// ═══════════════════════════════════════════════════════
// ROLE-SPECIFIC ID HELPERS
// ═══════════════════════════════════════════════════════

type RoleIdPrefix = "SUB" | "EMP" | "ATT";

const ROLE_ID_COL_MAP: Record<RoleIdPrefix, "subscriberId" | "employeeId" | "attorneyId"> = {
  SUB: "subscriberId",
  EMP: "employeeId",
  ATT: "attorneyId",
};

const ROLE_ID_DB_COL_MAP: Record<RoleIdPrefix, typeof users.subscriberId | typeof users.employeeId | typeof users.attorneyId> = {
  SUB: users.subscriberId,
  EMP: users.employeeId,
  ATT: users.attorneyId,
};

async function getMaxRoleIdNum(db: NonNullable<Awaited<ReturnType<typeof getDb>>>, prefix: RoleIdPrefix): Promise<number> {
  const col = ROLE_ID_DB_COL_MAP[prefix];
  const result = await db
    .select({ val: sql<number>`MAX(CAST(SPLIT_PART(${col}, '-', 2) AS INTEGER))` })
    .from(users)
    .where(sql`${col} LIKE ${prefix + "-%"}`);
  if (result.length > 0 && result[0].val != null) {
    return result[0].val;
  }
  return 0;
}

function buildRoleIdUpdate(prefix: RoleIdPrefix, newId: string, now: Date) {
  switch (prefix) {
    case "SUB": return { subscriberId: newId, updatedAt: now };
    case "EMP": return { employeeId: newId, updatedAt: now };
    case "ATT": return { attorneyId: newId, updatedAt: now };
  }
}

export async function assignRoleId(
  userId: number,
  role: "subscriber" | "employee" | "attorney"
): Promise<string | null> {
  const db = await getDb();
  if (!db) return null;

  const prefixMap: Record<string, RoleIdPrefix> = {
    subscriber: "SUB",
    employee: "EMP",
    attorney: "ATT",
  };
  const prefix = prefixMap[role];
  if (!prefix) return null;
  const dbCol = ROLE_ID_DB_COL_MAP[prefix];

  const existing = await db.select({ val: dbCol }).from(users).where(eq(users.id, userId)).limit(1);
  if (existing.length > 0 && existing[0].val) {
    return existing[0].val;
  }

  const MAX_RETRIES = 3;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const maxNum = await getMaxRoleIdNum(db, prefix);
    const newId = `${prefix}-${String(maxNum + 1).padStart(4, "0")}`;
    try {
      await db.update(users)
        .set(buildRoleIdUpdate(prefix, newId, new Date()))
        .where(and(eq(users.id, userId), sql`${dbCol} IS NULL`));
      const check = await db.select({ val: dbCol }).from(users).where(eq(users.id, userId)).limit(1);
      if (check.length > 0 && check[0].val) return check[0].val;
      return newId;
    } catch (err: unknown) {
      const pgErr = err as { code?: string };
      if (pgErr?.code === "23505" && attempt < MAX_RETRIES - 1) {
        continue;
      }
      throw err;
    }
  }
  return null;
}

// ═══════════════════════════════════════════════════════
// DISCOUNT CODE HELPERS
// ═══════════════════════════════════════════════════════

async function generateDiscountCode(): Promise<string> {
  const db = await getDb();
  if (!db) {
    return `TTML-${String(Math.floor(Math.random() * 900) + 1).padStart(3, "0")}`;
  }
  const result = await db
    .select({ val: sql<number>`MAX(CAST(SPLIT_PART(${discountCodes.code}, '-', 2) AS INTEGER))` })
    .from(discountCodes)
    .where(sql`${discountCodes.code} LIKE 'TTML-%'`);

  let nextNum = 1;
  if (result.length > 0 && result[0].val != null) {
    nextNum = result[0].val + 1;
  }
  return `TTML-${String(nextNum).padStart(3, "0")}`;
}

export async function createDiscountCodeForEmployee(
  employeeId: number,
  _employeeName?: string
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const existing = await db
    .select()
    .from(discountCodes)
    .where(eq(discountCodes.employeeId, employeeId))
    .limit(1);
  if (existing.length > 0) return existing[0];
  const MAX_RETRIES = 3;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const code = await generateDiscountCode();
    try {
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
    } catch (err: any) {
      if (err?.code === "23505" && attempt < MAX_RETRIES - 1) {
        console.warn(`[DiscountCode] Unique conflict on ${code}, retrying (${attempt + 1}/${MAX_RETRIES})`);
        continue;
      }
      throw err;
    }
  }
  throw new Error("Failed to generate unique discount code after retries");
}

export async function rotateDiscountCode(
  employeeId: number,
  _employeeName?: string
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const MAX_RETRIES = 3;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const newCode = await generateDiscountCode();
    try {
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
    } catch (err: any) {
      if (err?.code === "23505" && attempt < MAX_RETRIES - 1) {
        console.warn(`[DiscountCode] Unique conflict on rotate ${newCode}, retrying (${attempt + 1}/${MAX_RETRIES})`);
        continue;
      }
      throw err;
    }
  }
  throw new Error("Failed to rotate discount code after retries");
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
    expiresAt?: Date | null;
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

export async function getAdminReferralDetails(employeeId: number) {
  const db = await getDb();
  if (!db) return [];

  const rows = await db
    .select({
      commissionId: commissionLedger.id,
      subscriberId: commissionLedger.subscriberId,
      subscriberName: users.name,
      subscriberEmail: users.email,
      saleAmount: commissionLedger.saleAmount,
      commissionAmount: commissionLedger.commissionAmount,
      commissionStatus: commissionLedger.status,
      commissionCreatedAt: commissionLedger.createdAt,
      subscriptionPlan: subscriptions.plan,
      subscriptionStatus: subscriptions.status,
      subscriptionCreatedAt: subscriptions.createdAt,
    })
    .from(commissionLedger)
    .leftJoin(users, eq(commissionLedger.subscriberId, users.id))
    .leftJoin(subscriptions, eq(commissionLedger.subscriberId, subscriptions.userId))
    .where(eq(commissionLedger.employeeId, employeeId))
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

  const results = await db.execute(sql`
    SELECT *,
      GREATEST(0.3, POWER(0.9, EXTRACT(EPOCH FROM (NOW() - created_at)) / (30 * 86400))) AS recency_multiplier,
      CASE
        WHEN letters_before_avg_score IS NOT NULL AND letters_after_avg_score IS NOT NULL
          AND letters_after_avg_score > letters_before_avg_score THEN 1.2
        WHEN letters_before_avg_score IS NOT NULL AND letters_after_avg_score IS NOT NULL
          AND letters_after_avg_score < letters_before_avg_score THEN 0.8
        ELSE 1.0
      END AS effectiveness_boost,
      weight * GREATEST(0.3, POWER(0.9, EXTRACT(EPOCH FROM (NOW() - created_at)) / (30 * 86400)))
        * CASE
            WHEN letters_before_avg_score IS NOT NULL AND letters_after_avg_score IS NOT NULL
              AND letters_after_avg_score > letters_before_avg_score THEN 1.2
            WHEN letters_before_avg_score IS NOT NULL AND letters_after_avg_score IS NOT NULL
              AND letters_after_avg_score < letters_before_avg_score THEN 0.8
            ELSE 1.0
          END AS effective_score
    FROM pipeline_lessons
    WHERE is_active = true
      ${filters.letterType ? sql`AND (letter_type = ${filters.letterType} OR letter_type IS NULL)` : sql``}
      ${filters.jurisdiction ? sql`AND (jurisdiction = ${filters.jurisdiction} OR jurisdiction IS NULL)` : sql``}
      ${filters.pipelineStage ? sql`AND (pipeline_stage = ${filters.pipelineStage} OR pipeline_stage IS NULL)` : sql``}
    ORDER BY effective_score DESC
    LIMIT ${filters.limit ?? 10}
  `);

  return results as any[];
}

export async function getActiveLessonsForScope(filters: {
  letterType: string;
  jurisdiction?: string;
  pipelineStage?: string;
}) {
  const db = await getDb();
  if (!db) return [];
  const conditions = [eq(pipelineLessons.isActive, true)];
  conditions.push(
    or(
      eq(pipelineLessons.letterType, filters.letterType as NonNullable<InsertPipelineLesson["letterType"]>),
      isNull(pipelineLessons.letterType),
    )!
  );
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
    .orderBy(desc(pipelineLessons.weight));
}

export async function boostExistingLesson(id: number, newWeight: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.execute(sql`
    UPDATE pipeline_lessons
    SET hit_count = hit_count + 1,
        weight = ${Math.min(newWeight, 100)},
        updated_at = NOW()
    WHERE id = ${id}
  `);
}

export async function incrementLessonInjectionStats(lessonIds: number[]) {
  if (lessonIds.length === 0) return;
  const db = await getDb();
  if (!db) return;
  await db.execute(sql`
    UPDATE pipeline_lessons
    SET times_injected = times_injected + 1,
        last_injected_at = NOW()
    WHERE id = ANY(${lessonIds})
  `);
}

export async function getAverageQualityScoreForScope(
  letterType?: string,
  jurisdiction?: string,
): Promise<number | null> {
  const db = await getDb();
  if (!db) return null;

  let result;
  if (letterType && jurisdiction) {
    result = await db.execute(sql`
      SELECT ROUND(AVG(lqs.computed_score))::int as avg_score
      FROM letter_quality_scores lqs
      JOIN letter_requests lr ON lqs.letter_request_id = lr.id
      WHERE lr.letter_type = ${letterType} AND lr.jurisdiction_state = ${jurisdiction}
    `);
  } else if (letterType) {
    result = await db.execute(sql`
      SELECT ROUND(AVG(lqs.computed_score))::int as avg_score
      FROM letter_quality_scores lqs
      JOIN letter_requests lr ON lqs.letter_request_id = lr.id
      WHERE lr.letter_type = ${letterType}
    `);
  } else {
    result = await db.execute(sql`
      SELECT ROUND(AVG(computed_score))::int as avg_score
      FROM letter_quality_scores
    `);
  }

  const row = result[0] as any;
  return row?.avg_score ?? null;
}

export async function updateLessonEffectivenessScores(
  lessonIds: number[],
  newScore: number,
) {
  if (lessonIds.length === 0) return;
  const db = await getDb();
  if (!db) return;

  await db.execute(sql`
    UPDATE pipeline_lessons
    SET letters_after_avg_score = CASE
        WHEN letters_after_avg_score IS NULL THEN ${newScore}
        ELSE ROUND((letters_after_avg_score * effectiveness_samples + ${newScore}) / (effectiveness_samples + 1))
      END,
      effectiveness_samples = effectiveness_samples + 1,
      updated_at = NOW()
    WHERE id = ANY(${lessonIds})
  `);
}

export async function getLessonImpactSummary() {
  const db = await getDb();
  if (!db) return [];
  return db.execute(sql`
    SELECT
      id,
      lesson_text as "lessonText",
      category,
      letter_type as "letterType",
      jurisdiction,
      weight,
      hit_count as "hitCount",
      times_injected as "timesInjected",
      letters_before_avg_score as "lettersBeforeAvgScore",
      letters_after_avg_score as "lettersAfterAvgScore",
      CASE
        WHEN letters_before_avg_score IS NOT NULL AND letters_after_avg_score IS NOT NULL
        THEN letters_after_avg_score - letters_before_avg_score
        ELSE NULL
      END as "scoreDelta",
      created_at as "createdAt"
    FROM pipeline_lessons
    WHERE is_active = true
      AND times_injected > 0
      AND letters_before_avg_score IS NOT NULL
    ORDER BY
      CASE
        WHEN letters_after_avg_score IS NOT NULL
        THEN ABS(letters_after_avg_score - letters_before_avg_score)
        ELSE 0
      END DESC
    LIMIT 20
  `);
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

// ═══════════════════════════════════════════════════════
// ADMIN 2FA VERIFICATION CODES
// ═══════════════════════════════════════════════════════

export async function createAdminVerificationCode(userId: number): Promise<string> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(adminVerificationCodes)
    .set({ used: true })
    .where(and(eq(adminVerificationCodes.userId, userId), eq(adminVerificationCodes.used, false)));
  const code = String(Math.floor(10000000 + Math.random() * 90000000));
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
  await db.insert(adminVerificationCodes).values({ userId, code, expiresAt });
  return code;
}

export async function verifyAdminCode(userId: number, code: string): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  const result = await db
    .select({ id: adminVerificationCodes.id })
    .from(adminVerificationCodes)
    .where(
      and(
        eq(adminVerificationCodes.userId, userId),
        eq(adminVerificationCodes.code, code),
        eq(adminVerificationCodes.used, false),
        sql`${adminVerificationCodes.expiresAt} > NOW()`
      )
    )
    .limit(1);
  if (result.length === 0) return false;
  await db.update(adminVerificationCodes)
    .set({ used: true })
    .where(eq(adminVerificationCodes.id, result[0].id));
  return true;
}

// ─── Blog Posts ───────────────────────────────────────────────────────────────

export async function getPublishedBlogPosts(options: { category?: string; limit?: number; offset?: number } = {}) {
  const db = await getDb();
  if (!db) return { posts: [], total: 0 };
  const { category, limit = 12, offset = 0 } = options;

  const conditions = category
    ? and(eq(blogPosts.status, "published"), eq(blogPosts.category, category))
    : eq(blogPosts.status, "published");

  const [posts, countResult] = await Promise.all([
    db.select({
      id: blogPosts.id,
      slug: blogPosts.slug,
      title: blogPosts.title,
      excerpt: blogPosts.excerpt,
      category: blogPosts.category,
      authorName: blogPosts.authorName,
      readingTimeMinutes: blogPosts.readingTimeMinutes,
      publishedAt: blogPosts.publishedAt,
      ogImageUrl: blogPosts.ogImageUrl,
    })
      .from(blogPosts)
      .where(conditions)
      .orderBy(desc(blogPosts.publishedAt))
      .limit(limit)
      .offset(offset),
    db.select({ count: sql<number>`count(*)::int` })
      .from(blogPosts)
      .where(conditions),
  ]);
  return { posts, total: countResult[0]?.count ?? 0 };
}

export async function getBlogPostBySlug(slug: string) {
  const db = await getDb();
  if (!db) return null;
  const result = await db
    .select()
    .from(blogPosts)
    .where(and(eq(blogPosts.slug, slug), eq(blogPosts.status, "published")))
    .limit(1);
  return result[0] ?? null;
}

export async function getBlogPostBySlugAnyStatus(slug: string) {
  const db = await getDb();
  if (!db) return null;
  const result = await db
    .select()
    .from(blogPosts)
    .where(eq(blogPosts.slug, slug))
    .limit(1);
  return result[0] ?? null;
}

export async function getBlogPostSlugById(id: number): Promise<string | null> {
  const db = await getDb();
  if (!db) return null;
  const result = await db
    .select({ slug: blogPosts.slug })
    .from(blogPosts)
    .where(eq(blogPosts.id, id))
    .limit(1);
  return result[0]?.slug ?? null;
}

export async function getAllBlogPosts() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(blogPosts).orderBy(desc(blogPosts.updatedAt));
}

export async function createBlogPost(data: {
  slug: string;
  title: string;
  excerpt: string;
  content: string;
  category: string;
  metaDescription?: string;
  ogImageUrl?: string;
  authorName?: string;
  status?: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const wordCount = data.content.split(/\s+/).length;
  const readingTimeMinutes = Math.max(1, Math.round(wordCount / 200));
  const now = new Date();
  const [result] = await db.insert(blogPosts).values({
    slug: data.slug,
    title: data.title,
    excerpt: data.excerpt,
    content: data.content,
    category: data.category,
    metaDescription: data.metaDescription ?? null,
    ogImageUrl: data.ogImageUrl ?? null,
    authorName: data.authorName ?? "Talk to My Lawyer",
    readingTimeMinutes,
    status: data.status ?? "draft",
    publishedAt: data.status === "published" ? now : null,
    createdAt: now,
    updatedAt: now,
  }).returning({ id: blogPosts.id });
  return result;
}

export async function updateBlogPost(id: number, data: Partial<{
  slug: string;
  title: string;
  excerpt: string;
  content: string;
  category: string;
  metaDescription: string | null;
  ogImageUrl: string | null;
  authorName: string;
  status: string;
}>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const updates: Record<string, string | number | Date | null | undefined> = { ...data, updatedAt: new Date() };
  if (data.content) {
    const wordCount = data.content.split(/\s+/).length;
    updates.readingTimeMinutes = Math.max(1, Math.round(wordCount / 200));
  }
  if (data.status === "published") {
    const existing = await db.select({ publishedAt: blogPosts.publishedAt }).from(blogPosts).where(eq(blogPosts.id, id)).limit(1);
    if (!existing[0]?.publishedAt) {
      updates.publishedAt = new Date();
    }
  }
  await db.update(blogPosts).set(updates).where(eq(blogPosts.id, id));
}

export async function deleteBlogPost(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(blogPosts).where(eq(blogPosts.id, id));
}

// ═══════════════════════════════════════════════════════
// PIPELINE ANALYTICS AGGREGATION QUERIES
// ═══════════════════════════════════════════════════════

export async function getPipelineAnalytics(dateRange: "7d" | "30d" | "90d" | "all" = "30d") {
  const db = await getDb();
  if (!db) return null;

  const dateFilter = dateRange === "all"
    ? sql`TRUE`
    : sql`lr.created_at >= NOW() - INTERVAL '1 day' * ${dateRange === "7d" ? 7 : dateRange === "30d" ? 30 : 90}`;

  const jobDateFilter = dateRange === "all"
    ? sql`TRUE`
    : sql`wj.created_at >= NOW() - INTERVAL '1 day' * ${dateRange === "7d" ? 7 : dateRange === "30d" ? 30 : 90}`;

  const researchDateFilter = dateRange === "all"
    ? sql`TRUE`
    : sql`rr.created_at >= NOW() - INTERVAL '1 day' * ${dateRange === "7d" ? 7 : dateRange === "30d" ? 30 : 90}`;

  const reviewDateFilter = dateRange === "all"
    ? sql`TRUE`
    : sql`ra.created_at >= NOW() - INTERVAL '1 day' * ${dateRange === "7d" ? 7 : dateRange === "30d" ? 30 : 90}`;

  const qualityDateFilter = dateRange === "all"
    ? sql`TRUE`
    : sql`lqs.created_at >= NOW() - INTERVAL '1 day' * ${dateRange === "7d" ? 7 : dateRange === "30d" ? 30 : 90}`;

  const [
    successRateResult,
    stageTimingsResult,
    citationStatsResult,
    reviewTurnaroundResult,
    qualityDistributionResult,
    qualityTrendResult,
    retryStatsResult,
    failureReasonsResult,
  ] = await Promise.all([
    db.execute(sql`
      SELECT
        COUNT(*)::int as "totalLetters",
        COUNT(*) FILTER (WHERE lr.status = 'approved' OR lr.status = 'client_approved' OR lr.status = 'sent')::int as "approvedCount",
        COUNT(*) FILTER (WHERE lr.status = 'pipeline_failed')::int as "failedCount",
        CASE WHEN COUNT(*) > 0
          THEN ROUND(
            COUNT(*) FILTER (WHERE lr.status IN ('approved', 'client_approved', 'sent'))::numeric * 100.0 / COUNT(*), 1
          )
          ELSE 0
        END as "successRate"
      FROM letter_requests lr
      WHERE ${dateFilter}
    `),
    db.execute(sql`
      SELECT
        wj.job_type as "stage",
        COUNT(*)::int as "totalJobs",
        COUNT(*) FILTER (WHERE wj.status = 'completed')::int as "completed",
        COUNT(*) FILTER (WHERE wj.status = 'failed')::int as "failed",
        ROUND(AVG(EXTRACT(EPOCH FROM (wj.completed_at - wj.started_at)) * 1000) FILTER (WHERE wj.status = 'completed' AND wj.started_at IS NOT NULL AND wj.completed_at IS NOT NULL), 0) as "avgDurationMs"
      FROM workflow_jobs wj
      WHERE ${jobDateFilter}
      GROUP BY wj.job_type
      ORDER BY wj.job_type
    `),
    db.execute(sql`
      SELECT
        COUNT(*)::int as "totalRuns",
        COUNT(*) FILTER (WHERE rr.status = 'completed')::int as "completedRuns",
        COUNT(*) FILTER (WHERE rr.status = 'failed' OR rr.status = 'invalid')::int as "failedRuns",
        COUNT(*) FILTER (WHERE rr.validation_result_json IS NOT NULL)::int as "validatedRuns",
        COUNT(*) FILTER (WHERE rr.cache_hit = true)::int as "cacheHits"
      FROM research_runs rr
      WHERE ${researchDateFilter}
    `),
    db.execute(sql`
      SELECT
        ra.action,
        COUNT(*)::int as "count",
        ROUND(AVG(EXTRACT(EPOCH FROM (ra.created_at - lr.updated_at)) * 1000) FILTER (WHERE ra.action IN ('approve', 'reject', 'needs_changes')), 0) as "avgTurnaroundMs"
      FROM review_actions ra
      JOIN letter_requests lr ON ra.letter_request_id = lr.id
      WHERE ra.actor_type IN ('attorney', 'admin')
        AND ra.action IN ('approve', 'reject', 'needs_changes')
        AND ${reviewDateFilter}
      GROUP BY ra.action
    `),
    db.execute(sql`
      SELECT
        CASE
          WHEN lqs.computed_score >= 90 THEN 'excellent'
          WHEN lqs.computed_score >= 70 THEN 'good'
          WHEN lqs.computed_score >= 50 THEN 'fair'
          ELSE 'poor'
        END as "bucket",
        COUNT(*)::int as "count"
      FROM letter_quality_scores lqs
      WHERE lqs.computed_score IS NOT NULL AND ${qualityDateFilter}
      GROUP BY "bucket"
      ORDER BY "bucket"
    `),
    db.execute(sql`
      SELECT
        DATE_TRUNC('day', lqs.created_at)::date::text as "date",
        COUNT(*)::int as "count",
        ROUND(AVG(lqs.computed_score), 1) as "avgScore",
        ROUND(AVG(CASE WHEN lqs.first_pass_approved THEN 100 ELSE 0 END), 1) as "firstPassRate"
      FROM letter_quality_scores lqs
      WHERE lqs.computed_score IS NOT NULL AND ${qualityDateFilter}
      GROUP BY DATE_TRUNC('day', lqs.created_at)
      ORDER BY "date" ASC
    `),
    db.execute(sql`
      SELECT
        COUNT(*) FILTER (WHERE wj.attempt_count > 1)::int as "retriedJobs",
        COUNT(*)::int as "totalJobs",
        MAX(wj.attempt_count)::int as "maxAttempts",
        ROUND(AVG(wj.attempt_count) FILTER (WHERE wj.attempt_count > 1), 1) as "avgRetries"
      FROM workflow_jobs wj
      WHERE ${jobDateFilter}
    `),
    db.execute(sql`
      SELECT
        CASE
          WHEN wj.error_message ILIKE '%timeout%' OR wj.error_message ILIKE '%timed out%' OR wj.error_message ILIKE '%ETIMEDOUT%' THEN 'API Timeout'
          WHEN wj.error_message ILIKE '%rate limit%' OR wj.error_message ILIKE '%429%' OR wj.error_message ILIKE '%too many requests%' THEN 'Rate Limit'
          WHEN wj.error_message ILIKE '%citation%' OR wj.error_message ILIKE '%source%validation%' THEN 'Citation Failure'
          WHEN wj.error_message ILIKE '%word count%' OR wj.error_message ILIKE '%too short%' OR wj.error_message ILIKE '%too long%' THEN 'Word Count'
          WHEN wj.error_message ILIKE '%token%' OR wj.error_message ILIKE '%context length%' OR wj.error_message ILIKE '%max_tokens%' THEN 'Token Limit'
          WHEN wj.error_message ILIKE '%network%' OR wj.error_message ILIKE '%ECONNREFUSED%' OR wj.error_message ILIKE '%fetch failed%' THEN 'Network Error'
          WHEN wj.error_message ILIKE '%auth%' OR wj.error_message ILIKE '%unauthorized%' OR wj.error_message ILIKE '%403%' OR wj.error_message ILIKE '%401%' THEN 'Auth Error'
          WHEN wj.error_message ILIKE '%parse%' OR wj.error_message ILIKE '%JSON%' OR wj.error_message ILIKE '%invalid%response%' THEN 'Parse Error'
          ELSE 'Other'
        END as "reason",
        COUNT(*)::int as "count"
      FROM workflow_jobs wj
      WHERE wj.status = 'failed' AND wj.error_message IS NOT NULL AND ${jobDateFilter}
      GROUP BY "reason"
      ORDER BY "count" DESC
    `),
  ]);

  const successRate = successRateResult[0];
  const stageTimings = stageTimingsResult;
  const citationStats = citationStatsResult[0];
  const reviewTurnaround = reviewTurnaroundResult;
  const qualityDistribution = qualityDistributionResult;
  const qualityTrend = qualityTrendResult;
  const retryStats = retryStatsResult;
  const failureReasons = failureReasonsResult;

  return {
    successRate: {
      totalLetters: Number((successRate as any)?.totalLetters ?? 0),
      approvedCount: Number((successRate as any)?.approvedCount ?? 0),
      failedCount: Number((successRate as any)?.failedCount ?? 0),
      rate: Number((successRate as any)?.successRate ?? 0),
    },
    stageTimings: (stageTimings as any[]).map(s => ({
      stage: s.stage,
      totalJobs: Number(s.totalJobs ?? 0),
      completed: Number(s.completed ?? 0),
      failed: Number(s.failed ?? 0),
      avgDurationMs: Number(s.avgDurationMs ?? 0),
    })),
    citationStats: {
      totalRuns: Number((citationStats as any)?.totalRuns ?? 0),
      completedRuns: Number((citationStats as any)?.completedRuns ?? 0),
      failedRuns: Number((citationStats as any)?.failedRuns ?? 0),
      validatedRuns: Number((citationStats as any)?.validatedRuns ?? 0),
      cacheHits: Number((citationStats as any)?.cacheHits ?? 0),
    },
    reviewTurnaround: (reviewTurnaround as any[]).map(r => ({
      action: r.action,
      count: Number(r.count ?? 0),
      avgTurnaroundMs: Number(r.avgTurnaroundMs ?? 0),
    })),
    qualityDistribution: (qualityDistribution as any[]).map(q => ({
      bucket: q.bucket,
      count: Number(q.count ?? 0),
    })),
    qualityTrend: (qualityTrend as any[]).map(t => ({
      date: t.date,
      count: Number(t.count ?? 0),
      avgScore: Number(t.avgScore ?? 0),
      firstPassRate: Number(t.firstPassRate ?? 0),
    })),
    retryStats: {
      retriedJobs: Number((retryStats as any)?.[0]?.retriedJobs ?? 0),
      totalJobs: Number((retryStats as any)?.[0]?.totalJobs ?? 0),
      maxAttempts: Number((retryStats as any)?.[0]?.maxAttempts ?? 0),
      avgRetries: Number((retryStats as any)?.[0]?.avgRetries ?? 0),
    },
    failureReasons: (failureReasons as any[]).map(f => ({
      reason: f.reason,
      count: Number(f.count ?? 0),
    })),
  };
}
