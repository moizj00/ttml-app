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
