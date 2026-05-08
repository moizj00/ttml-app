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
import * as PgBossPkg from "pg-boss";
// @ts-ignore
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
    options?: {
      id?: string;
      singletonKey?: string;
      retryLimit?: number;
      expireInSeconds?: number;
      startAfter?: number | string | Date;
    }
  ): Promise<string | null | undefined>;
  createQueue(
    queueName: string,
    options: PgBossCreateQueueOptions
  ): Promise<void>;
  getQueueStats(queueName: string): Promise<PgBossQueueStats | undefined>;
  findJobs<T = unknown>(queueName: string): Promise<Array<PgBossFoundJob<T>>>;
  cancel(queueName: string, id: string | string[]): Promise<void>;
  work<T>(
    queueName: string,
    options: { localConcurrency?: number },
    handler: (job: Job<T>) => Promise<void>
  ): Promise<unknown>;
}

const PgBoss: { new(options: PgBossConstructorOptions): PgBossClient } =
  // pg-boss v10+ exports a named class: { PgBoss, ... }. Older CJS builds used default.
  ((PgBossPkg as any)?.PgBoss ?? (PgBossPkg as any)?.default ?? PgBossPkg) as {
    new(options: PgBossConstructorOptions): PgBossClient;
  };
import { logger } from "./logger";

// Force Node.js to prefer IPv4 addresses globally — Railway resolves
// Supabase pooler hostnames to IPv6 which is unreachable from Railway's network
dns.setDefaultResultOrder("ipv4first");

export const QUEUE_NAME = "multi-agent-pipeline";

// ─── Job Data Types ────────────────────────────────────────────────────────

export type PipelineJobType = "runPipeline" | "retryPipelineFromStage";

export interface RunPipelineJobData {
  type: "runPipeline";
  letterId: number;
  intake: unknown;
  userId: number | undefined;
  appUrl: string;
  label: string;
  usageContext?: {
    shouldRefundOnFailure: true;
    isPreviewGatedSubmission?: boolean;
    isFreeTrialSubmission: boolean;
  };
}

export interface RetryFromStageJobData {
  type: "retryPipelineFromStage";
  letterId: number;
  intake: unknown;
  stage: "research" | "drafting";
  userId: number | undefined;
}

export interface ReleaseDraftPreviewJobData {
  type: "releaseDraftPreview";
  letterId: number;
  attempt?: number;
}

export type PipelineJobData =
  | RunPipelineJobData
  | RetryFromStageJobData
  | ReleaseDraftPreviewJobData;

// ─── pg-boss Singleton ─────────────────────────────────────────────────────

let _boss: PgBossClient | null = null;
let _bossStarting: Promise<PgBossClient> | null = null;

export function isQueueConnectionConfigured(): boolean {
  return Boolean(
    process.env.SUPABASE_DIRECT_URL ||
    process.env.SUPABASE_DATABASE_URL ||
    process.env.DATABASE_URL
  );
}

/**
 * If a Supabase connection string points to the IPv6-only direct host
 * (`db.<PROJECT_REF>.supabase.co`), rewrite it to the session pooler
 * (`<region>.pooler.supabase.com:5432`) so it works on Railway's IPv4-only
 * network. The session pooler supports LISTEN/NOTIFY, which pg-boss needs.
 *
 * This exists because Railway's Supabase integration / reference-variable
 * sync intermittently overwrites pooler URLs back to direct URLs on deploy
 * (e.g. after a Supabase password rotation). Normalizing in code makes the
 * worker robust regardless of which form the env var lands in.
 *
 * Region is inferred from `SUPABASE_POOLER_HOST` env var; if unset, defaults
 * to `aws-1-us-west-2.pooler.supabase.com` (matches this project's region).
 */
function normalizeSupabaseUrlForPooler(rawUrl: string): string {
  const POOLER_HOST =
    process.env.SUPABASE_POOLER_HOST ||
    "aws-1-us-west-2.pooler.supabase.com";

  try {
    const url = new URL(rawUrl);
    const directMatch = url.hostname.match(
      /^db\.([a-z0-9]+)\.supabase\.co$/i
    );
    // Only rewrite when:
    //   1. hostname matches the IPv6-only direct host pattern, AND
    //   2. username is the bare `postgres` (no project-ref prefix).
    // If the username is already `postgres.<PROJECT_REF>`, the URL is
    // pooler-form already and we leave it alone.
    if (directMatch && url.username === "postgres") {
      const projectRef = directMatch[1];
      url.hostname = POOLER_HOST;
      url.username = `postgres.${projectRef}`;
      // Strip ?sslmode=require — Node treats it as 'verify-full' which fails
      // on Supabase's CA chain. pg-boss config sets rejectUnauthorized=false.
      url.searchParams.delete("sslmode");
      const masked = url.toString().replace(/\/\/([^:]+):([^@]+)@/, "//***:***@");
      logger.warn(
        { rewrittenTo: masked, projectRef },
        "[Queue] Auto-rewriting direct Supabase URL (db.*.supabase.co) to pooler form. Railway is IPv4-only; the direct host is IPv6-only and unreachable. Set SUPABASE_POOLER_HOST to override the default region."
      );
      return url.toString();
    }
  } catch (err) {
    logger.warn({ err }, "[Queue] Failed to parse connection string for pooler rewrite — using as-is");
  }
  return rawUrl;
}

function getConnectionString(): string {
  const envSource = process.env.SUPABASE_DIRECT_URL
    ? "SUPABASE_DIRECT_URL"
    : process.env.SUPABASE_DATABASE_URL
      ? "SUPABASE_DATABASE_URL"
      : process.env.DATABASE_URL
        ? "DATABASE_URL"
        : null;

  const rawUrl =
    process.env.SUPABASE_DIRECT_URL ||
    process.env.SUPABASE_DATABASE_URL ||
    process.env.DATABASE_URL;

  if (!rawUrl || !envSource) {
    throw new Error(
      "[Queue] No database URL found. Set SUPABASE_DIRECT_URL or DATABASE_URL for pg-boss."
    );
  }

  // Normalize direct → pooler so the worker stays connected even when
  // Railway/Supabase auto-syncs revert env vars to direct form.
  const url = normalizeSupabaseUrlForPooler(rawUrl);

  const masked = url.replace(/\/\/([^:]+):([^@]+)@/, "//***:***@");
  logger.info(`[Queue] Using ${envSource} for pg-boss connection: ${masked}`);

  // Note: the SESSION pooler (port 5432 on .pooler.supabase.com) supports
  // LISTEN/NOTIFY which pg-boss requires. Only the TRANSACTION pooler
  // (port 6543) lacks LISTEN/NOTIFY support. Warn only on port 6543.
  if (url.includes(":6543") || url.includes("pgbouncer=true")) {
    logger.warn(
      `[Queue] WARNING: ${envSource} points at the TRANSACTION pooler (:6543). ` +
      `pg-boss requires LISTEN/NOTIFY which is only supported on the session pooler ` +
      `(:5432) or a direct connection. Switch to port 5432 on .pooler.supabase.com.`
    );
  }

  return url;
}

/**
 * Resolve the hostname in a PostgreSQL connection string to an IPv4 address.
 * This is needed because Railway's network resolves Supabase pooler hostnames
 * to IPv6 addresses that are unreachable (ENETUNREACH).
 */
async function resolveConnectionToIPv4(
  connectionString: string
): Promise<string> {
  try {
    const url = new URL(connectionString);
    const hostname = url.hostname;

    // Skip if already an IP address
    if (/^\d+\.\d+\.\d+\.\d+$/.test(hostname)) {
      return connectionString;
    }

    // Skip Supabase pooler URLs — the pooler uses the hostname (via SNI) to
    // route to the right project, and the username `postgres.<PROJECT_REF>`
    // is interpreted in the context of that routing. Replacing the hostname
    // with a raw IPv4 address breaks the SNI handshake; pgbouncer then tries
    // to authenticate the literal user `postgres.<PROJECT_REF>` against the
    // shared `postgres` role, which fails with `password authentication
    // failed for user "postgres"`. We rely on `dns.setDefaultResultOrder(
    // "ipv4first")` (set in worker.ts) to prefer A records at connect time
    // — which keeps the hostname intact while still avoiding the IPv6
    // ENETUNREACH on Railway.
    if (hostname.endsWith(".pooler.supabase.com")) {
      logger.info(
        { hostname },
        "[Queue] Preserving Supabase pooler hostname for SNI-based project routing"
      );
      return connectionString;
    }

    const addresses = await dns.promises.resolve4(hostname);
    if (addresses.length > 0) {
      const ipv4 = addresses[0];
      logger.info(
        { hostname, ipv4 },
        "[Queue] Resolved hostname to IPv4 for pg-boss connection"
      );
      url.hostname = ipv4;
      return url.toString();
    }
  } catch (err) {
    logger.warn(
      { err },
      "[Queue] Failed to resolve hostname to IPv4, using original connection string"
    );
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
      logger.error(
        { err: startErr },
        "[Queue] pg-boss failed to start — database connection issue"
      );
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
      expireInSeconds: 60 * 60,
      deleteAfterSeconds: 7 * 24 * 60 * 60,
      retentionSeconds: 30 * 24 * 60 * 60,
    };
    try {
      await boss.createQueue(QUEUE_NAME, DESIRED_QUEUE_OPTIONS);
      logger.info(
        `[Queue] Created queue "${QUEUE_NAME}" with policy=${DESIRED_QUEUE_OPTIONS.policy}`
      );
    } catch (queueErr) {
      // Queue already exists — that's fine.
      logger.debug(
        { err: queueErr },
        "[Queue] createQueue (queue may already exist):"
      );
    }

    _boss = boss;
    logger.info(
      "[Queue] pg-boss started successfully (PostgreSQL-native queue)"
    );
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

export async function enqueuePipelineJob(
  pipelineId: string,
  payload: any,
  options?: { startAfter?: number | string | Date }
): Promise<string>;
export async function enqueuePipelineJob(
  data: RunPipelineJobData,
  options?: { startAfter?: number | string | Date }
): Promise<string>;
export async function enqueuePipelineJob(
  data: RunPipelineJobData | string,
  payloadOrOptions?:
    | (Partial<RunPipelineJobData> & Record<string, any>)
    | { startAfter?: number | string | Date },
  maybeOptions?: { startAfter?: number | string | Date }
): Promise<string> {
  return enqueuePipelineJobImpl(data, payloadOrOptions, maybeOptions);
}

export async function enqueuePipelineJobImpl(
  data: RunPipelineJobData | string,
  payloadOrOptions?:
    | (Partial<RunPipelineJobData> & Record<string, any>)
    | { startAfter?: number | string | Date },
  maybeOptions?: { startAfter?: number | string | Date }
): Promise<string> {
  const normalizedData: RunPipelineJobData =
    typeof data === "string"
      ? (() => {
          const payload = (payloadOrOptions ?? {}) as Partial<RunPipelineJobData> &
            Record<string, any>;
          const letterId = payload.letterId ?? Number(data);
          return {
            ...payload,
            type: "runPipeline",
            letterId,
            intake: payload.intake ?? payload.payload ?? payload.formData ?? payload,
            userId: payload.userId,
            appUrl: payload.appUrl ?? process.env.APP_URL ?? "",
            label: payload.label ?? `pipeline-${letterId}`,
          } as RunPipelineJobData;
        })()
      : data;
  const options =
    typeof data === "string"
      ? maybeOptions
      : (payloadOrOptions as { startAfter?: number | string | Date } | undefined);

  let boss: PgBossClient;
  let lastErr: unknown = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      boss = await getBoss();
      break;
    } catch (err) {
      lastErr = err;
      const delayMs = Math.min(1000 * Math.pow(2, attempt), 8000); // 1s, 2s, 4s (cap 8s)
      logger.warn(
        { err, attempt: attempt + 1, delayMs },
        `[Queue] getBoss() attempt ${attempt + 1}/3 failed, retrying in ${delayMs}ms...`
      );
      _boss = null;
      if (attempt < 2) {
        await new Promise((r) => setTimeout(r, delayMs));
      }
    }
  }
  if (!boss) {
    const msg = lastErr instanceof Error ? lastErr.message : String(lastErr);
    throw new Error(`[Queue] getBoss() failed after 3 attempts: ${msg}`);
  }
  // singletonKey provides application-level deduplication hint.
  // With 'standard' policy, pg-boss does NOT block on failed jobs with the same key.
  // Actual deduplication is enforced by the pipeline lock (acquirePipelineLock).
  logger.info(
    `[Queue] Sending pipeline job for letter #${normalizedData.letterId} (${normalizedData.label})...`
  );
  const id = await boss.send(QUEUE_NAME, normalizedData as unknown as object, {
    singletonKey: `letter-${normalizedData.letterId}`,

    // No retries at queue level — worker handles its own retry logic with backoff
    retryLimit: 0,
    expireInSeconds: 60 * 60,
    ...options,
  });
  if (id === null) {
    // Duplicate suppressed — a job for this letter is already active or queued.
    logger.warn(
      `[Queue] Duplicate pipeline job suppressed for letter #${normalizedData.letterId} (${normalizedData.label}) — already active/queued`
    );
    return `pipeline-${normalizedData.letterId}-deduplicated`;
  }
  logger.info(
    `[Queue] Enqueued pipeline job ${id} for letter #${normalizedData.letterId} (${normalizedData.label})`
  );
  return id!;
}

export async function enqueueDraftPreviewReleaseJob(
  letterId: number,
  startAfter: number | string | Date,
  attempt = 0
): Promise<string> {
  const boss = await getBoss();
  const data: ReleaseDraftPreviewJobData = {
    type: "releaseDraftPreview",
    letterId,
    attempt,
  };
  const id = await boss.send(QUEUE_NAME, data as unknown as object, {
    singletonKey: `draft-preview-release-${letterId}-${attempt}`,
    retryLimit: 0,
    expireInSeconds: 10 * 60,
    startAfter,
  });
  if (id === null) {
    logger.warn(
      `[Queue] Duplicate draft preview release job suppressed for letter #${letterId} (attempt=${attempt})`
    );
    return `draft-preview-release-${letterId}-${attempt}-deduplicated`;
  }
  logger.info(
    `[Queue] Enqueued draft preview release job ${id} for letter #${letterId} at ${new Date(
      startAfter
    ).toISOString()} (attempt=${attempt})`
  );
  return id!;
}

/**
 * Cancel any pending/deferred pipeline job for a given letter.
 * Used by admin force-transition to prevent a deferred job from
 * executing after the letter has been manually advanced.
 * Non-throwing: logs a warning on failure so the caller can continue.
 */
export async function cancelPipelineJobForLetter(
  letterId: number
): Promise<void> {
  try {
    const boss = await getBoss();
    const jobs = await boss.findJobs<PipelineJobData>(QUEUE_NAME);
    const pending = jobs.filter(
      j =>
        (j.state === "created" ||
          j.state === "retry" ||
          j.state === "active") &&
        (j.data as { letterId?: number })?.letterId === letterId
    );
    if (pending.length === 0) return;
    await boss.cancel(
      QUEUE_NAME,
      pending.map(j => j.id)
    );
    logger.info(
      { letterId, count: pending.length },
      "[Queue] Cancelled deferred pipeline job(s) for letter"
    );
  } catch (err) {
    logger.warn(
      { err, letterId },
      "[Queue] cancelPipelineJobForLetter failed (non-fatal)"
    );
  }
}

export async function enqueueRetryFromStageJob(
  data: RetryFromStageJobData
): Promise<string> {
  const boss = await getBoss();
  // singletonKey deduplicates at the queue level — same as enqueuePipelineJob
  const id = await boss.send(QUEUE_NAME, data as unknown as object, {
    singletonKey: `letter-${data.letterId}`,
    retryLimit: 0,
    expireInSeconds: 30 * 60,
  });
  if (id === null) {
    logger.warn(
      `[Queue] Duplicate retry-from-stage job suppressed for letter #${data.letterId} (stage: ${data.stage}) — already active/queued`
    );
    return `retry-${data.letterId}-${data.stage}-deduplicated`;
  }
  logger.info(
    `[Queue] Enqueued retry-from-stage job ${id} for letter #${data.letterId} (stage: ${data.stage})`
  );
  return id!;
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
  getFailed(
    start: number,
    end: number
  ): Promise<
    Array<{
      id: string;
      name: string;
      failedReason: string;
      finishedOn: number | null;
      data: PipelineJobData;
    }>
  >;
  getCompleted(
    start: number,
    end: number
  ): Promise<
    Array<{
      id: string;
      finishedOn: number | null;
      processedOn: number | null;
      data: PipelineJobData;
    }>
  >;
}
export function getPipelineQueue(): PipelineQueueShim {
  return {
    async getWaitingCount() {
      try {
        const boss = await getBoss();
        const stats = await boss.getQueueStats(QUEUE_NAME);
        return (stats?.queuedCount ?? 0) + (stats?.deferredCount ?? 0);
      } catch {
        return 0;
      }
    },
    async getActiveCount() {
      try {
        const boss = await getBoss();
        const stats = await boss.getQueueStats(QUEUE_NAME);
        return stats?.activeCount ?? 0;
      } catch {
        return 0;
      }
    },
    async getCompletedCount() {
      try {
        const boss = await getBoss();
        const stats = await boss.getQueueStats(QUEUE_NAME);
        return stats?.totalCount ?? 0;
      } catch {
        return 0;
      }
    },
    async getFailedCount() {
      try {
        const boss = await getBoss();
        const jobs = await boss.findJobs<PipelineJobData>(QUEUE_NAME);
        return jobs.filter(j => j.state === "failed").length;
      } catch {
        return 0;
      }
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
            failedReason:
              (j.output as { message?: string } | null)?.message ??
              "Unknown error",
            finishedOn: j.completedOn ? j.completedOn.getTime() : null,
            data: j.data,
          }));
      } catch {
        return [];
      }
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
      } catch {
        return [];
      }
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
