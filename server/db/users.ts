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
import { logger } from "../logger";

// ═══════════════════════════════════════════════════════
// USER HELPERS
// ═══════════════════════════════════════════════════════

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) {
    logger.warn("[Database] Cannot upsert user: database not available");
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

