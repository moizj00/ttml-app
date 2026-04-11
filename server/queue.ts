/**
 * Pipeline Queue — pg-boss (PostgreSQL-native job queue)
 *
 * Replaces BullMQ + Upstash Redis with pg-boss backed by the existing
 * Supabase PostgreSQL database. This eliminates the Redis dependency entirely.
 *
 * Connection: Uses SUPABASE_DIRECT_URL (direct connection, not the pooler)
 * because pg-boss needs a persistent connection for its internal polling.
 *
 * Exported API is intentionally kept compatible with the old BullMQ-based
 * queue so callers (services/letters.ts, stalePipelineLockRecovery.ts, etc.)
 * require no changes.
 */

import { PgBoss } from "pg-boss";
import { logger } from "./logger";

export const QUEUE_NAME = "pipeline";

// ─── Job Data Types ────────────────────────────────────────────────────────

export type PipelineJobType =
  | "runPipeline"
  | "retryPipelineFromStage";

export interface RunPipelineJobData {
  type: "runPipeline";
  letterId: number;
  intake: unknown;
  userId: number | undefined;
  appUrl: string;
  label: string;
  usageContext?: { shouldRefundOnFailure: true; isFreeTrialSubmission: boolean };
}

export interface RetryFromStageJobData {
  type: "retryPipelineFromStage";
  letterId: number;
  intake: unknown;
  stage: "research" | "drafting";
  userId: number | undefined;
}

export type PipelineJobData = RunPipelineJobData | RetryFromStageJobData;

// ─── pg-boss Singleton ─────────────────────────────────────────────────────

let _boss: PgBoss | null = null;
let _bossStarting: Promise<PgBoss> | null = null;

function getConnectionString(): string {
  const envSource = process.env.SUPABASE_DIRECT_URL
    ? "SUPABASE_DIRECT_URL"
    : process.env.SUPABASE_DATABASE_URL
      ? "SUPABASE_DATABASE_URL"
      : process.env.DATABASE_URL
        ? "DATABASE_URL"
        : null;

  const url =
    process.env.SUPABASE_DIRECT_URL ||
    process.env.SUPABASE_DATABASE_URL ||
    process.env.DATABASE_URL;

  if (!url || !envSource) {
    throw new Error(
      "[Queue] No database URL found. Set SUPABASE_DIRECT_URL (direct connection, not pooler) for pg-boss."
    );
  }

  const masked = url.replace(/\/\/([^:]+):([^@]+)@/, "//***:***@");
  logger.info(`[Queue] Using ${envSource} for pg-boss connection: ${masked}`);

  if (url.includes(":6543") || url.includes("pooler.supabase.com") || url.includes("pgbouncer=true")) {
    logger.warn(
      `[Queue] WARNING: ${envSource} appears to be a connection pooler URL. ` +
      `pg-boss requires a DIRECT connection (port 5432, not 6543) for LISTEN/NOTIFY. ` +
      `Set SUPABASE_DIRECT_URL to the direct connection string.`
    );
  }

  return url;
}

export async function getBoss(): Promise<PgBoss> {
  if (_boss) return _boss;
  if (_bossStarting) return _bossStarting;

  _bossStarting = (async () => {
    const connectionString = getConnectionString();
    const boss = new PgBoss({
      connectionString,
      ssl: { rejectUnauthorized: false },
      schedule: false,
    });

    boss.on("error", (err) => {
      logger.error({ err }, "[Queue] pg-boss error:");
    });

    boss.on("warning", (warning) => {
      logger.warn({ warning }, "[Queue] pg-boss warning:");
    });

    try {
      await boss.start();
    } catch (startErr) {
      logger.error({ err: startErr }, "[Queue] pg-boss failed to start — database connection issue");
      throw startErr;
    }

    try {
      await boss.createQueue(QUEUE_NAME, {
        retryLimit: 0,
        expireInSeconds: 30 * 60,
        deleteAfterSeconds: 7 * 24 * 60 * 60,
        retentionSeconds: 30 * 24 * 60 * 60,
      });
    } catch (queueErr) {
      logger.debug({ err: queueErr }, "[Queue] createQueue (queue may already exist):");
    }

    _boss = boss;
    logger.info("[Queue] pg-boss started successfully (PostgreSQL-native queue)");
    return boss;
  })();

  try {
    return await _bossStarting;
  } catch (err) {
    _bossStarting = null;
    throw err;
  }
}

// ─── Enqueue Functions ─────────────────────────────────────────────────────

export async function enqueuePipelineJob(data: RunPipelineJobData): Promise<string> {
  let boss: PgBoss;
  try {
    boss = await getBoss();
  } catch (firstErr) {
    logger.warn({ err: firstErr }, "[Queue] First getBoss() attempt failed, retrying once...");
    _boss = null;
    boss = await getBoss();
  }
  const jobId = `pipeline-${data.letterId}-${Date.now()}`;
  const id = await boss.send(QUEUE_NAME, data as unknown as object, {
    id: jobId,
    retryLimit: 0,
    expireInSeconds: 30 * 60,
  });
  const resolvedId = id ?? jobId;
  logger.info(`[Queue] Enqueued pipeline job ${resolvedId} for letter #${data.letterId} (${data.label})`);
  return resolvedId;
}

export async function enqueueRetryFromStageJob(data: RetryFromStageJobData): Promise<string> {
  const boss = await getBoss();
  const dedupeKey = `retry-${data.letterId}-${data.stage}`;
  // Use singletonKey to deduplicate: only one retry job per letter+stage in queue
  const id = await boss.send(QUEUE_NAME, data as unknown as object, {
    singletonKey: dedupeKey,
    retryLimit: 0,
    expireInSeconds: 30 * 60,
  });
  if (!id) {
    logger.warn(`[Queue] Retry job already queued for letter #${data.letterId} stage=${data.stage} — skipping duplicate`);
    return dedupeKey;
  }
  logger.info(`[Queue] Enqueued retry job ${id} for letter #${data.letterId} stage=${data.stage}`);
  return id;
}

// ─── Queue Health Shim ─────────────────────────────────────────────────────
//
// admin/jobs.ts calls getPipelineQueue() and uses BullMQ-specific methods
// (getWaitingCount, getActiveCount, etc.). We return a shim that maps these
// to pg-boss equivalents so the admin dashboard still works.

export interface PipelineQueueShim {
  getWaitingCount(): Promise<number>;
  getActiveCount(): Promise<number>;
  getCompletedCount(): Promise<number>;
  getFailedCount(): Promise<number>;
  getDelayedCount(): Promise<number>;
  getFailed(start: number, end: number): Promise<Array<{
    id: string;
    name: string;
    failedReason: string;
    finishedOn: number | null;
    data: PipelineJobData;
  }>>;
  getCompleted(start: number, end: number): Promise<Array<{
    id: string;
    finishedOn: number | null;
    processedOn: number | null;
    data: PipelineJobData;
  }>>;
}

export function getPipelineQueue(): PipelineQueueShim {
  return {
    async getWaitingCount() {
      try {
        const boss = await getBoss();
        const stats = await boss.getQueueStats(QUEUE_NAME);
        return (stats?.queuedCount ?? 0) + (stats?.deferredCount ?? 0);
      } catch { return 0; }
    },
    async getActiveCount() {
      try {
        const boss = await getBoss();
        const stats = await boss.getQueueStats(QUEUE_NAME);
        return stats?.activeCount ?? 0;
      } catch { return 0; }
    },
    async getCompletedCount() {
      try {
        const boss = await getBoss();
        const stats = await boss.getQueueStats(QUEUE_NAME);
        return stats?.totalCount ?? 0;
      } catch { return 0; }
    },
    async getFailedCount() {
      try {
        const boss = await getBoss();
        const jobs = await boss.findJobs<PipelineJobData>(QUEUE_NAME);
        return jobs.filter(j => j.state === "failed").length;
      } catch { return 0; }
    },
    async getDelayedCount() {
      return 0; // pg-boss doesn't have a separate "delayed" state
    },
    async getFailed(start: number, end: number) {
      try {
        const boss = await getBoss();
        const jobs = await boss.findJobs<PipelineJobData>(QUEUE_NAME);
        return jobs
          .filter(j => j.state === "failed")
          .slice(start, end + 1)
          .map(j => ({
            id: j.id,
            name: j.name,
            failedReason: (j.output as { message?: string } | null)?.message ?? "Unknown error",
            finishedOn: j.completedOn ? j.completedOn.getTime() : null,
            data: j.data,
          }));
      } catch { return []; }
    },
    async getCompleted(start: number, end: number) {
      try {
        const boss = await getBoss();
        const jobs = await boss.findJobs<PipelineJobData>(QUEUE_NAME);
        return jobs
          .filter(j => j.state === "completed")
          .slice(start, end + 1)
          .map(j => ({
            id: j.id,
            finishedOn: j.completedOn ? j.completedOn.getTime() : null,
            processedOn: j.startedOn ? j.startedOn.getTime() : null,
            data: j.data,
          }));
      } catch { return []; }
    },
  };
}

// ─── Backward-compat stub ──────────────────────────────────────────────────

/** @deprecated No longer used — pg-boss connects via DATABASE_URL directly */
export function buildRedisConnection(): never {
  throw new Error(
    "[Queue] buildRedisConnection() is no longer available — queue has been migrated to pg-boss (PostgreSQL-native)."
  );
}
