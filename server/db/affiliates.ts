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

