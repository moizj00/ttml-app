import { Queue, type ConnectionOptions } from "bullmq";
import IORedis from "ioredis";
import { logger } from "./logger";

const QUEUE_NAME = "pipeline";

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

function buildRedisConnection(): ConnectionOptions {
  const redisUrl = process.env.UPSTASH_REDIS_URL;
  if (redisUrl) {
    return new IORedis(redisUrl, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    });
  }

  const restUrl = process.env.UPSTASH_REDIS_REST_URL ?? "";
  const restToken = process.env.UPSTASH_REDIS_REST_TOKEN ?? "";

  if (!restUrl || !restToken) {
    throw new Error(
      "[Queue] Redis not configured. Set UPSTASH_REDIS_URL (preferred) or UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN."
    );
  }

  const host = restUrl.replace(/^https?:\/\//, "").replace(/\/$/, "");
  const password = restToken;

  return new IORedis({
    host,
    port: 6379,
    password,
    tls: {},
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  });
}

let _queue: Queue<PipelineJobData> | null = null;

export function getPipelineQueue(): Queue<PipelineJobData> {
  if (!_queue) {
    _queue = new Queue<PipelineJobData>(QUEUE_NAME, {
      connection: buildRedisConnection(),
      defaultJobOptions: {
        attempts: 1,
        removeOnComplete: { count: 200 },
        removeOnFail: { count: 500 },
      },
    });
  }
  return _queue;
}

export async function enqueuePipelineJob(data: RunPipelineJobData): Promise<string> {
  const queue = getPipelineQueue();
  const job = await queue.add(`pipeline:${data.label}:${data.letterId}`, data, {
    jobId: `pipeline-${data.letterId}-${Date.now()}`,
  });
  logger.info(`[Queue] Enqueued pipeline job ${job.id} for letter #${data.letterId} (${data.label})`);
  return job.id!;
}

export async function enqueueRetryFromStageJob(data: RetryFromStageJobData): Promise<string> {
  const queue = getPipelineQueue();
  const dedupeId = `retry-${data.letterId}-${data.stage}`;
  try {
    const existing = await queue.getJob(dedupeId);
    if (existing) {
      const state = await existing.getState();
      if (state === "waiting" || state === "active" || state === "delayed") {
        logger.warn(`[Queue] Retry job already queued/active for letter #${data.letterId} stage=${data.stage} (state=${state}) — skipping duplicate`);
        return existing.id!;
      }
      await existing.remove().catch(() => {});
    }
  } catch (checkErr) {
    logger.warn(`[Queue] Dedupe check failed for letter #${data.letterId}, proceeding with timestamped ID:`, checkErr);
    const job = await queue.add(`retry:${data.stage}:${data.letterId}`, data, {
      jobId: `retry-${data.letterId}-${data.stage}-${Date.now()}`,
    });
    return job.id!;
  }
  try {
    const job = await queue.add(`retry:${data.stage}:${data.letterId}`, data, {
      jobId: dedupeId,
    });
    logger.info(`[Queue] Enqueued retry job ${job.id} for letter #${data.letterId} stage=${data.stage}`);
    return job.id!;
  } catch (addErr) {
    logger.warn(`[Queue] Dedupe add failed (likely race), using timestamped ID for letter #${data.letterId}:`, addErr);
    const job = await queue.add(`retry:${data.stage}:${data.letterId}`, data, {
      jobId: `retry-${data.letterId}-${data.stage}-${Date.now()}`,
    });
    return job.id!;
  }
}

export { QUEUE_NAME, buildRedisConnection };
