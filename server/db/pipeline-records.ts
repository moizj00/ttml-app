import { and, asc, desc, eq, gt, inArray, isNull, lt, ne, or, sql } from "drizzle-orm";
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
  pipelineStreamChunks,
  researchRuns,
  reviewActions,
  subscriptions,
  users,
  workflowJobs,
} from "../../drizzle/schema";
import type { InsertUser, InsertPipelineLesson, InsertLetterQualityScore } from "../../drizzle/schema";
import { getDb } from "./core";

// ═══════════════════════════════════════════════════════
// DOMAIN ERRORS — stream chunk ownership
// ═══════════════════════════════════════════════════════

/** Thrown by getStreamChunksAfter when the requested letter does not exist. */
export class LetterNotFoundError extends Error {
  constructor(letterId: number) {
    super(`Letter ${letterId} not found`);
    this.name = "LetterNotFoundError";
  }
}

/** Thrown by getStreamChunksAfter when the letter exists but is owned by a
 *  different user.  Callers (e.g. the tRPC procedure) should translate this
 *  to a FORBIDDEN response so the UI can distinguish "no data yet" from
 *  "you do not have access". */
export class LetterAccessDeniedError extends Error {
  constructor(letterId: number) {
    super(`Access denied to letter ${letterId}`);
    this.name = "LetterAccessDeniedError";
  }
}

// ═══════════════════════════════════════════════════════
// WORKFLOW JOB HELPERS
// ═══════════════════════════════════════════════════════

export async function createWorkflowJob(data: {
  letterRequestId: number;
  jobType: "research" | "draft_generation" | "generation_pipeline" | "retry" | "vetting" | "assembly";
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
// STREAM CHUNK HELPERS
// ═══════════════════════════════════════════════════════

/**
 * Return all pipeline_stream_chunks for a letter with sequence_number > afterSeq,
 * ordered ascending. Validates ownership — only returns rows when the requesting
 * user owns the letter.
 *
 * Used by the server-authenticated tRPC `letters.streamChunksAfter` endpoint so
 * the frontend can backfill missed chunks without relying on the unauthenticated
 * Supabase browser client (which would silently return 0 rows under RLS).
 */
export async function getStreamChunksAfter(
  letterId: number,
  userId: number,
  afterSeq: number
) {
  const db = await getDb();
  if (!db) return [];

  // Ownership check — only serve chunks for letters that belong to this user.
  const [letter] = await db
    .select({ userId: letterRequests.userId })
    .from(letterRequests)
    .where(eq(letterRequests.id, letterId))
    .limit(1);

  if (!letter) throw new LetterNotFoundError(letterId);
  if (letter.userId !== userId) throw new LetterAccessDeniedError(letterId);

  return db
    .select()
    .from(pipelineStreamChunks)
    .where(
      and(
        eq(pipelineStreamChunks.letterId, letterId),
        gt(pipelineStreamChunks.sequenceNumber, afterSeq)
      )
    )
    .orderBy(asc(pipelineStreamChunks.sequenceNumber));
}
