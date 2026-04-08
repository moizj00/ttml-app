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
import { getDb, getReadDb } from "./core";
import { logger } from "../logger";

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
  const inserted = result[0];

  // Fire-and-forget: embed the lesson text in the background
  if (inserted?.insertId && data.lessonText) {
    setImmediate(async () => {
      try {
        const { generateEmbedding } = await import("../pipeline/embeddings");
        const embedding = await generateEmbedding(data.lessonText);
        const embDb = await getDb();
        if (!embDb) return;
        // Build a validated numeric array and pass it as a bound SQL parameter.
        // Each element is cast through Number() to guarantee no non-numeric values
        // can be injected.  The $1 placeholder in the final SQL is the pgvector
        // literal string '[n,n,...]'; PostgreSQL casts it to the vector type server-side.
        const numericEmbedding = embedding.map((v) => {
          const n = Number(v);
          if (!isFinite(n)) throw new Error(`Invalid embedding value: ${v}`);
          return n;
        });
        const vectorParam = `[${numericEmbedding.join(",")}]`;
        await embDb.execute(
          sql`UPDATE pipeline_lessons SET embedding = ${vectorParam}::vector WHERE id = ${inserted.insertId}`
        );
        logger.info(`[Lessons] Stored embedding for lesson #${inserted.insertId}`);
      } catch (embErr) {
        logger.warn({ err: embErr }, `[Lessons] Failed to embed lesson #${inserted?.insertId}:`);
      }
    });
  }

  return inserted;
}

export async function getActiveLessons(filters: {
  letterType?: string;
  jurisdiction?: string;
  pipelineStage?: string;
  limit?: number;
}) {
  const db = await getReadDb();
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
  const db = await getReadDb();
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
  const db = await getReadDb();
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
  const db = await getReadDb();
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
  const db = await getReadDb();
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
  const db = await getReadDb();
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

export async function getDistinctLessonScopes(minActiveLessons: number = 5): Promise<
  Array<{ letterType: string; jurisdiction: string | null; count: number }>
> {
  const db = await getReadDb();
  if (!db) return [];
  const results = await db.execute(sql`
    SELECT letter_type, jurisdiction, COUNT(*)::int AS count
    FROM pipeline_lessons
    WHERE is_active = true AND letter_type IS NOT NULL
    GROUP BY letter_type, jurisdiction
    HAVING COUNT(*) >= ${minActiveLessons}
    ORDER BY count DESC
  `);
  return (results as any[]).map((r) => ({
    letterType: r.letter_type,
    jurisdiction: r.jurisdiction,
    count: r.count,
  }));
}

export async function archiveStaleIneffectiveLessons(): Promise<
  Array<{ id: number; archival_reason: string }>
> {
  const db = await getDb();
  if (!db) throw new Error("Database not available for archival");
  const results = await db.execute(sql`
    UPDATE pipeline_lessons
    SET is_active = false, updated_at = NOW()
    WHERE is_active = true
      AND (
        (created_at < NOW() - INTERVAL '6 months' AND times_injected = 0)
        OR (effectiveness_samples >= 5
            AND letters_after_avg_score IS NOT NULL
            AND letters_before_avg_score IS NOT NULL
            AND letters_after_avg_score < letters_before_avg_score)
        OR (weight < 10
            AND (last_injected_at IS NULL OR last_injected_at < NOW() - INTERVAL '90 days'))
      )
    RETURNING id,
      CASE
        WHEN created_at < NOW() - INTERVAL '6 months' AND times_injected = 0
          THEN 'stale_never_injected'
        WHEN effectiveness_samples >= 5
          AND letters_after_avg_score IS NOT NULL
          AND letters_before_avg_score IS NOT NULL
          AND letters_after_avg_score < letters_before_avg_score
          THEN 'proven_harmful'
        WHEN weight < 10
          AND (last_injected_at IS NULL OR last_injected_at < NOW() - INTERVAL '90 days')
          THEN 'low_weight_inactive'
        ELSE 'unknown'
      END AS archival_reason
  `);
  return results as any[];
}

