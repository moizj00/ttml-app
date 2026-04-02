import { Queue, type ConnectionOptions } from "bullmq";
import IORedis from "ioredis";

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
  console.log(`[Queue] Enqueued pipeline job ${job.id} for letter #${data.letterId} (${data.label})`);
  return job.id!;
}

export async function enqueueRetryFromStageJob(data: RetryFromStageJobData): Promise<string> {
  const queue = getPipelineQueue();
  const job = await queue.add(`retry:${data.stage}:${data.letterId}`, data, {
    jobId: `retry-${data.letterId}-${data.stage}-${Date.now()}`,
  });
  console.log(`[Queue] Enqueued retry job ${job.id} for letter #${data.letterId} stage=${data.stage}`);
  return job.id!;
}

export { QUEUE_NAME, buildRedisConnection };
