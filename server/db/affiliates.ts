import { and, desc, eq, inArray, isNull, lt, ne, or, sql } from "drizzle-orm";
import { captureServerException } from "../sentry";
import {
  adminVerificationCodes,
  attachments,
  blogPosts,
  commissionLedger,
  commissionPayoutAllocations,
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
        logger.warn(`[DiscountCode] Unique conflict on ${code}, retrying (${attempt + 1}/${MAX_RETRIES})`);
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
        logger.warn(`[DiscountCode] Unique conflict on rotate ${newCode}, retrying (${attempt + 1}/${MAX_RETRIES})`);
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

export class PayoutUnavailableError extends Error {
  constructor(public readonly available: number) {
    super("No available commission balance for payout");
    this.name = "PayoutUnavailableError";
  }
}

export class PayoutAmountMismatchError extends Error {
  constructor(
    public readonly requested: number,
    public readonly available: number
  ) {
    super("Payout amount must equal the full available balance");
    this.name = "PayoutAmountMismatchError";
  }
}

export async function createCommission(data: {
  employeeId: number;
  letterRequestId?: number;
  subscriberId?: number;
  discountCodeId?: number;
  stripePaymentIntentId?: string;
  stripeInvoiceId?: string;
  saleAmount: number; // cents
  commissionRate?: number; // basis points, default 500 = 5%
  commissionAmount: number; // cents
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // ─── Idempotency: prevent duplicate commissions for the same Stripe invoice/payment ───
  if (data.stripeInvoiceId) {
    const existing = await db
      .select({ id: commissionLedger.id })
      .from(commissionLedger)
      .where(eq(commissionLedger.stripeInvoiceId, data.stripeInvoiceId))
      .limit(1);
    if (existing.length > 0) {
      logger.info(
        `[Commission] Duplicate prevented: commission already exists for invoice ${data.stripeInvoiceId}`
      );
      return {
        id: existing[0].id,
        insertId: existing[0].id,
        created: false,
      };
    }
  }

  if (data.stripePaymentIntentId) {
    const existing = await db
      .select({ id: commissionLedger.id })
      .from(commissionLedger)
      .where(
        eq(commissionLedger.stripePaymentIntentId, data.stripePaymentIntentId)
      )
      .limit(1);
    if (existing.length > 0) {
      logger.info(
        `[Commission] Duplicate prevented: commission already exists for PI ${data.stripePaymentIntentId}`
      );
      return {
        id: existing[0].id,
        insertId: existing[0].id,
        created: false,
      };
    }
  }

  const values = {
    employeeId: data.employeeId,
    letterRequestId: data.letterRequestId,
    subscriberId: data.subscriberId,
    discountCodeId: data.discountCodeId,
    stripePaymentIntentId: data.stripePaymentIntentId,
    stripeInvoiceId: data.stripeInvoiceId,
    saleAmount: data.saleAmount,
    commissionRate: data.commissionRate ?? 500,
    commissionAmount: data.commissionAmount,
    status: "pending" as const,
  };

  const returning = {
    id: commissionLedger.id,
    insertId: commissionLedger.id,
  };

  const result = data.stripeInvoiceId
    ? await db
        .insert(commissionLedger)
        .values(values)
        .onConflictDoNothing({ target: commissionLedger.stripeInvoiceId })
        .returning(returning)
    : data.stripePaymentIntentId
      ? await db
          .insert(commissionLedger)
          .values(values)
          .onConflictDoNothing({ target: commissionLedger.stripePaymentIntentId })
          .returning(returning)
      : await db.insert(commissionLedger).values(values).returning(returning);
  if (result[0]) {
    return { ...result[0], created: true };
  }

  const existing = await db
    .select({ id: commissionLedger.id })
    .from(commissionLedger)
    .where(
      data.stripeInvoiceId
        ? eq(commissionLedger.stripeInvoiceId, data.stripeInvoiceId)
        : eq(
            commissionLedger.stripePaymentIntentId,
            data.stripePaymentIntentId ?? ""
          )
    )
    .limit(1);
  if (existing[0]) {
    return {
      id: existing[0].id,
      insertId: existing[0].id,
      created: false,
    };
  }

  throw new Error("Failed to create commission");
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
  if (!db) return { totalEarned: 0, pending: 0, reserved: 0, paid: 0, referralCount: 0 };

  const rows = await db.execute(sql`
    WITH commission_state AS (
      SELECT
        c.status,
        c.subscriber_id,
        c.commission_amount,
        EXISTS (
          SELECT 1
          FROM commission_payout_allocations a
          JOIN payout_requests p ON p.id = a.payout_request_id
          WHERE a.commission_id = c.id
            AND p.status IN ('pending', 'processing')
        ) AS is_reserved
      FROM commission_ledger c
      WHERE c.employee_id = ${employeeId}
    )
    SELECT
      COALESCE(SUM(CASE WHEN status <> 'voided' THEN commission_amount ELSE 0 END), 0)::int AS "totalEarned",
      COALESCE(SUM(CASE WHEN status = 'pending' AND NOT is_reserved THEN commission_amount ELSE 0 END), 0)::int AS "pending",
      COALESCE(SUM(CASE WHEN status = 'pending' AND is_reserved THEN commission_amount ELSE 0 END), 0)::int AS "reserved",
      COALESCE(SUM(CASE WHEN status = 'paid' THEN commission_amount ELSE 0 END), 0)::int AS "paid",
      COUNT(DISTINCT CASE WHEN status <> 'voided' AND subscriber_id IS NOT NULL THEN subscriber_id END)::int AS "referralCount"
    FROM commission_state
  `) as Array<{
    totalEarned: number;
    pending: number;
    reserved: number;
    paid: number;
    referralCount: number;
  }>;

  const row = rows[0];
  return {
    totalEarned: Number(row?.totalEarned ?? 0),
    pending: Number(row?.pending ?? 0),
    reserved: Number(row?.reserved ?? 0),
    paid: Number(row?.paid ?? 0),
    referralCount: Number(row?.referralCount ?? 0),
  };
}

/** Batch version: returns earnings summary for ALL employees in a single query.
 *  Used by adminEmployeePerformance to avoid N+1 queries. */
export async function getAllEmployeeEarnings(): Promise<
  Array<{
    employeeId: number;
    totalEarned: number;
    pending: number;
    reserved: number;
    paid: number;
    referralCount: number;
  }>
> {
  const db = await getDb();
  if (!db) return [];
  const rows = await db.execute(sql`
    WITH commission_state AS (
      SELECT
        c.employee_id,
        c.status,
        c.subscriber_id,
        c.commission_amount,
        EXISTS (
          SELECT 1
          FROM commission_payout_allocations a
          JOIN payout_requests p ON p.id = a.payout_request_id
          WHERE a.commission_id = c.id
            AND p.status IN ('pending', 'processing')
        ) AS is_reserved
      FROM commission_ledger c
      WHERE c.employee_id IS NOT NULL
    )
    SELECT
      employee_id::int AS "employeeId",
      COALESCE(SUM(CASE WHEN status <> 'voided' THEN commission_amount ELSE 0 END), 0)::int AS "totalEarned",
      COALESCE(SUM(CASE WHEN status = 'pending' AND NOT is_reserved THEN commission_amount ELSE 0 END), 0)::int AS "pending",
      COALESCE(SUM(CASE WHEN status = 'pending' AND is_reserved THEN commission_amount ELSE 0 END), 0)::int AS "reserved",
      COALESCE(SUM(CASE WHEN status = 'paid' THEN commission_amount ELSE 0 END), 0)::int AS "paid",
      COUNT(DISTINCT CASE WHEN status <> 'voided' AND subscriber_id IS NOT NULL THEN subscriber_id END)::int AS "referralCount"
    FROM commission_state
    GROUP BY employee_id
  `) as Array<{
    employeeId: number;
    totalEarned: number;
    pending: number;
    reserved: number;
    paid: number;
    referralCount: number;
  }>;

  return rows.map(row => ({
    employeeId: Number(row.employeeId),
    totalEarned: Number(row.totalEarned ?? 0),
    pending: Number(row.pending ?? 0),
    reserved: Number(row.reserved ?? 0),
    paid: Number(row.paid ?? 0),
    referralCount: Number(row.referralCount ?? 0),
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
      stripeInvoiceId: commissionLedger.stripeInvoiceId,
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

  return db.execute(sql`
    SELECT
      MIN(c.id)::int AS "commissionId",
      c.subscriber_id::int AS "subscriberId",
      MAX(u.name) AS "subscriberName",
      MAX(u.email) AS "subscriberEmail",
      COALESCE(SUM(CASE WHEN c.status <> 'voided' THEN c.sale_amount ELSE 0 END), 0)::int AS "saleAmount",
      COALESCE(SUM(CASE WHEN c.status <> 'voided' THEN c.commission_amount ELSE 0 END), 0)::int AS "commissionAmount",
      CASE
        WHEN BOOL_OR(c.status = 'pending') THEN 'pending'
        WHEN BOOL_OR(c.status = 'paid') THEN 'paid'
        ELSE 'voided'
      END AS "commissionStatus",
      MIN(c.created_at) AS "commissionCreatedAt",
      MAX(s.plan::text) AS "subscriptionPlan",
      MAX(s.status::text) AS "subscriptionStatus",
      MAX(s.created_at) AS "subscriptionCreatedAt",
      COUNT(*) FILTER (WHERE c.status <> 'voided')::int AS "commissionCount"
    FROM commission_ledger c
    LEFT JOIN users u ON u.id = c.subscriber_id
    LEFT JOIN subscriptions s ON s.user_id = c.subscriber_id
    WHERE c.employee_id = ${employeeId}
      AND c.subscriber_id IS NOT NULL
    GROUP BY c.subscriber_id
    ORDER BY MAX(c.created_at) DESC
  `) as Promise<Array<{
    commissionId: number;
    subscriberId: number;
    subscriberName: string | null;
    subscriberEmail: string | null;
    saleAmount: number;
    commissionAmount: number;
    commissionStatus: "pending" | "paid" | "voided";
    commissionCreatedAt: Date;
    subscriptionPlan: string | null;
    subscriptionStatus: string | null;
    subscriptionCreatedAt: Date | null;
    commissionCount: number;
  }>>;
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

  return db.transaction(async tx => {
    const eligibleCommissions = await tx.execute(sql`
      SELECT
        c.id::int AS "id",
        c.commission_amount::int AS "commissionAmount"
      FROM commission_ledger c
      WHERE c.employee_id = ${data.employeeId}
        AND c.status = 'pending'
        AND NOT EXISTS (
          SELECT 1
          FROM commission_payout_allocations a
          JOIN payout_requests p ON p.id = a.payout_request_id
          WHERE a.commission_id = c.id
            AND p.status IN ('pending', 'processing')
        )
      ORDER BY c.created_at ASC, c.id ASC
      FOR UPDATE
    `) as Array<{ id: number; commissionAmount: number }>;

    const available = eligibleCommissions.reduce(
      (sum, row) => sum + Number(row.commissionAmount),
      0
    );
    if (available < 1000) {
      throw new PayoutUnavailableError(available);
    }
    if (available !== data.amount) {
      throw new PayoutAmountMismatchError(data.amount, available);
    }

    const result = await tx
      .insert(payoutRequests)
      .values({
        employeeId: data.employeeId,
        amount: data.amount,
        paymentMethod: data.paymentMethod ?? "bank_transfer",
        paymentDetails: data.paymentDetails as any,
        status: "pending",
      })
      .returning({ insertId: payoutRequests.id });
    const payout = result[0];
    if (!payout) throw new Error("Failed to create payout request");

    await tx.insert(commissionPayoutAllocations).values(
      eligibleCommissions.map(row => ({
        payoutRequestId: payout.insertId,
        commissionId: Number(row.id),
        amount: Number(row.commissionAmount),
      }))
    );

    return {
      insertId: payout.insertId,
      amount: data.amount,
      commissionIds: eligibleCommissions.map(row => Number(row.id)),
    };
  });
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
  await db.transaction(async tx => {
    if (action === "completed") {
      await tx.execute(sql`
        UPDATE commission_ledger c
        SET status = 'paid',
            paid_at = NOW()
        FROM commission_payout_allocations a
        WHERE a.commission_id = c.id
          AND a.payout_request_id = ${id}
          AND c.status = 'pending'
      `);
    }

    const updateData: Record<string, unknown> = {
      status: action,
      processedAt: new Date(),
      processedBy,
      updatedAt: new Date(),
    };
    if (action === "rejected" && rejectionReason) {
      updateData.rejectionReason = rejectionReason;
    }

    await tx
      .update(payoutRequests)
      .set(updateData as any)
      .where(eq(payoutRequests.id, id));

    if (action === "rejected") {
      await tx
        .delete(commissionPayoutAllocations)
        .where(eq(commissionPayoutAllocations.payoutRequestId, id));
    }
  });
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
