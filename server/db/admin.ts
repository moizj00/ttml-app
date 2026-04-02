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

