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
  fineTuneRuns,
} from "../../drizzle/schema";
import type { InsertUser, InsertPipelineLesson, InsertLetterQualityScore } from "../../drizzle/schema";
import { getDb, getReadDb } from "./core";

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
// EDIT DISTANCE TREND
// ═══════════════════════════════════════════════════════

export async function getEditDistanceTrend(days: number = 30) {
  const db = await getDb();
  if (!db) return [];
  return db.execute(sql`
    SELECT
      DATE_TRUNC('day', lqs.created_at)::date::text as "date",
      COUNT(*)::int as "count",
      ROUND(AVG(lqs.attorney_edit_distance), 1) as "avgEditDistance",
      ROUND(MIN(lqs.attorney_edit_distance), 1) as "minEditDistance",
      ROUND(MAX(lqs.attorney_edit_distance), 1) as "maxEditDistance"
    FROM letter_quality_scores lqs
    WHERE lqs.created_at >= NOW() - INTERVAL '1 day' * ${days}
      AND lqs.attorney_edit_distance IS NOT NULL
    GROUP BY DATE_TRUNC('day', lqs.created_at)
    ORDER BY "date" ASC
  `);
}

// ═══════════════════════════════════════════════════════
// RAG MONITORING ANALYTICS
// ═══════════════════════════════════════════════════════

export async function getRAGAnalytics(days: number = 30) {
  const db = await getDb();
  if (!db) return null;

  const dateFilter = days > 0
    ? sql`wj.created_at >= NOW() - INTERVAL '1 day' * ${days}`
    : sql`TRUE`;

  const [ragSummary, abComparison, ragTrend] = await Promise.all([
    db.execute(sql`
      SELECT
        COUNT(*)::int as "totalDraftJobs",
        COUNT(*) FILTER (WHERE (wj.response_payload_json->>'ragInjected')::boolean = true)::int as "ragInjectedCount",
        COUNT(*) FILTER (WHERE wj.response_payload_json->>'ragAbGroup' = 'control')::int as "controlCount",
        COUNT(*) FILTER (WHERE wj.response_payload_json->>'ragAbGroup' = 'test')::int as "testCount",
        ROUND(
          COUNT(*) FILTER (WHERE (wj.response_payload_json->>'ragInjected')::boolean = true)::numeric * 100.0 /
          NULLIF(COUNT(*) FILTER (WHERE wj.response_payload_json->>'ragAbGroup' IS NOT NULL), 0),
          1
        ) as "ragInjectionRate",
        ROUND(AVG(
          CASE WHEN (wj.response_payload_json->>'ragExampleCount')::int > 0
            THEN (wj.response_payload_json->>'ragExampleCount')::int
            ELSE NULL
          END
        ), 1) as "avgRagExamples"
      FROM workflow_jobs wj
      WHERE wj.job_type = 'draft_generation'
        AND wj.status = 'completed'
        AND ${dateFilter}
    `),
    db.execute(sql`
      SELECT
        wj.response_payload_json->>'ragAbGroup' as "abGroup",
        COUNT(*)::int as "letterCount",
        ROUND(AVG(lqs.computed_score), 1) as "avgQualityScore",
        ROUND(AVG(CASE WHEN lqs.first_pass_approved THEN 100 ELSE 0 END), 1) as "firstPassRate",
        ROUND(AVG(lqs.attorney_edit_distance), 1) as "avgEditDistance"
      FROM workflow_jobs wj
      JOIN letter_quality_scores lqs ON lqs.letter_request_id = wj.letter_request_id
      WHERE wj.job_type = 'draft_generation'
        AND wj.status = 'completed'
        AND wj.response_payload_json->>'ragAbGroup' IS NOT NULL
        AND ${dateFilter}
      GROUP BY wj.response_payload_json->>'ragAbGroup'
    `),
    db.execute(sql`
      SELECT
        DATE_TRUNC('day', wj.created_at)::date::text as "date",
        COUNT(*)::int as "totalJobs",
        COUNT(*) FILTER (WHERE (wj.response_payload_json->>'ragInjected')::boolean = true)::int as "ragInjectedCount",
        ROUND(
          COUNT(*) FILTER (WHERE (wj.response_payload_json->>'ragInjected')::boolean = true)::numeric * 100.0 /
          NULLIF(COUNT(*), 0),
          1
        ) as "ragInjectionRate"
      FROM workflow_jobs wj
      WHERE wj.job_type = 'draft_generation'
        AND wj.status = 'completed'
        AND ${dateFilter}
      GROUP BY DATE_TRUNC('day', wj.created_at)
      ORDER BY "date" ASC
    `),
  ]);

  interface RAGSummaryRow {
    totalDraftJobs?: unknown;
    ragInjectedCount?: unknown;
    controlCount?: unknown;
    testCount?: unknown;
    ragInjectionRate?: unknown;
    avgRagExamples?: unknown;
  }
  interface ABComparisonRow {
    abGroup?: unknown;
    letterCount?: unknown;
    avgQualityScore?: unknown;
    firstPassRate?: unknown;
    avgEditDistance?: unknown;
  }
  interface RAGTrendRow {
    date?: unknown;
    totalJobs?: unknown;
    ragInjectedCount?: unknown;
    ragInjectionRate?: unknown;
  }

  const summary = ragSummary[0] as RAGSummaryRow | undefined;
  return {
    summary: {
      totalDraftJobs: Number(summary?.totalDraftJobs ?? 0),
      ragInjectedCount: Number(summary?.ragInjectedCount ?? 0),
      controlCount: Number(summary?.controlCount ?? 0),
      testCount: Number(summary?.testCount ?? 0),
      ragInjectionRate: Number(summary?.ragInjectionRate ?? 0),
      avgRagExamples: Number(summary?.avgRagExamples ?? 0),
    },
    abComparison: (abComparison as ABComparisonRow[]).map((row) => ({
      abGroup: String(row.abGroup ?? "test"),
      letterCount: Number(row.letterCount ?? 0),
      avgQualityScore: Number(row.avgQualityScore ?? 0),
      firstPassRate: Number(row.firstPassRate ?? 0),
      avgEditDistance: Number(row.avgEditDistance ?? 0),
    })),
    ragTrend: (ragTrend as RAGTrendRow[]).map((row) => ({
      date: String(row.date ?? ""),
      totalJobs: Number(row.totalJobs ?? 0),
      ragInjectedCount: Number(row.ragInjectedCount ?? 0),
      ragInjectionRate: Number(row.ragInjectionRate ?? 0),
    })),
  };
}

// ═══════════════════════════════════════════════════════
// FINE-TUNE RUNS
// ═══════════════════════════════════════════════════════

export async function getFineTuneRuns(limit: number = 50) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(fineTuneRuns)
    .orderBy(desc(fineTuneRuns.startedAt))
    .limit(limit);
}

