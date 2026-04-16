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

import dns from "node:dns";
import type { Job } from "pg-boss";
// pg-boss publishes as CJS with `export = PgBoss`. Under Node ESM loading,
// the named-import form crashes at runtime with
// "Named export 'PgBoss' not found". The default-import form is what the
// Node error message itself recommends. We widen the type to `any` because
// the shipped type declarations are incomplete for the admin-dashboard
// surface (getQueueStats / findJobs / localConcurrency etc.).
import PgBossPkg from "pg-boss";
interface PgBossQueueStats {
  queuedCount?: number;
  deferredCount?: number;
  activeCount?: number;
  totalCount?: number;
}

interface PgBossFoundJob<T = unknown> {
  id: string;
  name: string;
  state: string;
  output?: { message?: string } | null;
  completedOn?: Date | null;
  startedOn?: Date | null;
  data: T;
}

interface PgBossConstructorOptions {
  connectionString: string;
  ssl?: { rejectUnauthorized: boolean };
  schedule?: boolean;
}

interface PgBossCreateQueueOptions {
  policy: "standard";
  retryLimit: number;
  expireInSeconds: number;
  deleteAfterSeconds: number;
  retentionSeconds: number;
}

interface PgBossClient {
  on(event: "error" | "warning", handler: (payload: unknown) => void): void;
  start(): Promise<void>;
  stop(options?: { graceful?: boolean; timeout?: number }): Promise<void>;
  send(
    queueName: string,
    data: object,
    options?: { id?: string; singletonKey?: string; retryLimit?: number; expireInSeconds?: number }
  ): Promise<string | null | undefined>;
  createQueue(queueName: string, options: PgBossCreateQueueOptions): Promise<void>;
  getQueueStats(queueName: string): Promise<PgBossQueueStats | undefined>;
  findJobs<T = unknown>(queueName: string): Promise<Array<PgBossFoundJob<T>>>;
  work<T>(
    queueName: string,
    options: { localConcurrency?: number },
    handler: (job: Job<T>) => Promise<void>
  ): Promise<unknown>;
}

const PgBoss: { new (options: PgBossConstructorOptions): PgBossClient } =
  ((PgBossPkg as any)?.default ?? PgBossPkg) as { new (options: PgBossConstructorOptions): PgBossClient };
import { logger } from "./logger";

// Force Node.js to prefer IPv4 addresses globally — Railway resolves
// Supabase pooler hostnames to IPv6 which is unreachable from Railway's network
dns.setDefaultResultOrder("ipv4first");

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

let _boss: PgBossClient | null = null;
let _bossStarting: Promise<PgBossClient> | null = null;

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

/**
 * Resolve the hostname in a PostgreSQL connection string to an IPv4 address.
 * This is needed because Railway's network resolves Supabase pooler hostnames
 * to IPv6 addresses that are unreachable (ENETUNREACH).
 */
async function resolveConnectionToIPv4(connectionString: string): Promise<string> {
  try {
    const url = new URL(connectionString);
    const hostname = url.hostname;

    // Skip if already an IP address
    if (/^\d+\.\d+\.\d+\.\d+$/.test(hostname)) {
      return connectionString;
    }

    const addresses = await dns.promises.resolve4(hostname);
    if (addresses.length > 0) {
      const ipv4 = addresses[0];
      logger.info({ hostname, ipv4 }, "[Queue] Resolved hostname to IPv4 for pg-boss connection");
      url.hostname = ipv4;
      return url.toString();
    }
  } catch (err) {
    logger.warn({ err }, "[Queue] Failed to resolve hostname to IPv4, using original connection string");
  }
  return connectionString;
}

export async function getBoss(): Promise<PgBossClient> {
  if (_boss) return _boss;
  if (_bossStarting) return _bossStarting;

  _bossStarting = (async () => {
    const rawConnectionString = getConnectionString();
    // Resolve hostname to IPv4 to avoid ENETUNREACH on Railway
    const connectionString = await resolveConnectionToIPv4(rawConnectionString);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pgBossOptions: PgBossConstructorOptions = {
      connectionString,
      ssl: { rejectUnauthorized: false },
      schedule: false,
    };
    const boss = new PgBoss(pgBossOptions);

    boss.on("error", (err: unknown) => {
      logger.error({ err }, "[Queue] pg-boss error:");
    });

    boss.on("warning", (warning: unknown) => {
      logger.warn({ warning }, "[Queue] pg-boss warning:");
    });

    try {
      await boss.start();
    } catch (startErr) {
      logger.error({ err: startErr }, "[Queue] pg-boss failed to start — database connection issue");
      throw startErr;
    }
    // Ensure the pipeline queue exists with desired retention settings.
    // We use 'standard' policy (the default) because 'key_strict_fifo' blocks
    // ALL new sends for a singletonKey if any prior job with that key is in
    // 'failed' state — which permanently blocks retries for that letter.
    // Deduplication is handled at the application layer via
    // acquirePipelineLock() in worker.ts (conditional UPDATE on pipeline_locked_at).
    const DESIRED_QUEUE_OPTIONS = {
      policy: "standard" as const,
      retryLimit: 0,
      expireInSeconds: 30 * 60,
      deleteAfterSeconds: 7 * 24 * 60 * 60,
      retentionSeconds: 30 * 24 * 60 * 60,
    };
    try {
      await boss.createQueue(QUEUE_NAME, DESIRED_QUEUE_OPTIONS);
      logger.info(`[Queue] Created queue "${QUEUE_NAME}" with policy=${DESIRED_QUEUE_OPTIONS.policy}`);
    } catch (queueErr) {
      // Queue already exists — that's fine.
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
  let boss: PgBossClient;
  try {
    boss = await getBoss();
  } catch (firstErr) {
    logger.warn({ err: firstErr }, "[Queue] First getBoss() attempt failed, retrying once...");
    _boss = null;
    boss = await getBoss();
  }
  const jobId = `pipeline-${data.letterId}-${Date.now()}`;
  // singletonKey provides application-level deduplication hint.
  // With 'standard' policy, pg-boss does NOT block on failed jobs with the same key.
  // Actual deduplication is enforced by the pipeline lock (acquirePipelineLock).
  logger.info(`[Queue] Sending pipeline job for letter #${data.letterId} (${data.label})...`);
  const id = await boss.send(QUEUE_NAME, data as unknown as object, {
    id: jobId,
    singletonKey: `letter-${data.letterId}`,

    // No retries at queue level — worker handles its own retry logic with backoff
    retryLimit: 0,
    expireInSeconds: 30 * 60,
  });
  if (id === null) {
    // Duplicate suppressed — a job for this letter is already active or queued.
    logger.warn(`[Queue] Duplicate pipeline job suppressed for letter #${data.letterId} (${data.label}) — already active/queued`);
    return `pipeline-${data.letterId}-deduplicated`;
  }
  const resolvedId = id ?? jobId;
  logger.info(`[Queue] Enqueued pipeline job ${resolvedId} for letter #${data.letterId} (${data.label})`);
  return resolvedId;
}

export async function enqueueRetryFromStageJob(data: RetryFromStageJobData): Promise<string> {
  const boss = await getBoss();
  const jobId = `retry-${data.letterId}-${data.stage}-${Date.now()}`;
  // singletonKey deduplicates at the queue level — same as enqueuePipelineJob
  const id = await boss.send(QUEUE_NAME, data as unknown as object, {
    id: jobId,
    singletonKey: `letter-${data.letterId}`,
    retryLimit: 0,
    expireInSeconds: 30 * 60,
  });
  if (id === null) {
    logger.warn(`[Queue] Duplicate retry-from-stage job suppressed for letter #${data.letterId} (stage: ${data.stage}) — already active/queued`);
    return `retry-${data.letterId}-${data.stage}-deduplicated`;
  }
  const resolvedId = id ?? jobId;
  logger.info(`[Queue] Enqueued retry-from-stage job ${resolvedId} for letter #${data.letterId} (stage: ${data.stage})`);
  return resolvedId;
}


// ─── Admin Dashboard Shim ──────────────────────────────────────────────────
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
        return jobs.filter((j) => j.state === "failed").length;
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
          .filter((j) => j.state === "failed")
          .slice(start, end + 1)
          .map((j) => ({
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
          .filter((j) => j.state === "completed")
          .slice(start, end + 1)
          .map((j) => ({
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
