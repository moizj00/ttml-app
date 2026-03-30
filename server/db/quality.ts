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

