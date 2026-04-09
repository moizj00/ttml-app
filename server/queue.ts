import { Logger } from "./_core/logger";
import { db } from "./db";
import { RunPipelineJobData } from "./types";
import PgBoss from "pg-boss";

const logger = Logger.child({ module: "queue" });

export const QUEUE_NAME = "pipeline";

let boss: PgBoss | null = null;

export async function initializeQueue() {
  if (boss) {
    logger.info("[Queue] PgBoss already initialized.");
    return;
  }

  logger.info("[Queue] Initializing PgBoss...");
  boss = new PgBoss({
    connectionString: process.env.SUPABASE_DIRECT_URL,
    schema: "public", // Use the public schema for pg-boss tables
    // You can add more pg-boss options here, e.g., monitoring
  });

  boss.on("error", (error) => logger.error({ error }, "[Queue] PgBoss error"));

  await boss.start();
  logger.info("[Queue] PgBoss initialized and started.");
}

export async function enqueuePipelineJob(data: RunPipelineJobData): Promise<string> {
  if (!boss) {
    throw new Error("PgBoss is not initialized. Call initializeQueue() first.");
  }
  logger.info({ letterId: data.letterId }, "[Queue] Enqueuing pipeline job...");
  const jobId = await boss.send(QUEUE_NAME, data, {
    // PgBoss options for the job, e.g., retry logic
    retryLimit: 5,
    retryDelay: 300, // 5 minutes
    expireInMinutes: 60 * 24, // 24 hours
  });
  if (!jobId) {
    throw new Error("Failed to enqueue job with PgBoss.");
  }
  logger.info({ letterId: data.letterId, jobId }, "[Queue] Pipeline job enqueued.");
  return jobId;
}

export async function enqueueRetryFromStageJob(data: RunPipelineJobData): Promise<string> {
  // For pg-boss, retrying from a stage is handled by the worker logic itself
  // or by re-enqueuing the job with specific data.
  // For now, we'll just re-enqueue it as a regular pipeline job.
  logger.warn({ letterId: data.letterId }, "[Queue] enqueueRetryFromStageJob called, re-enqueuing as standard pipeline job.");
  return enqueuePipelineJob(data);
}

export async function getPipelineQueue() {
  if (!boss) {
    throw new Error("PgBoss is not initialized. Call initializeQueue() first.");
  }
  // PgBoss does not expose a direct 'queue' object like BullMQ
  // You interact directly with the boss instance.
  return boss;
}

export async function closeQueue() {
  if (boss) {
    logger.info("[Queue] Closing PgBoss...");
    await boss.stop();
    boss = null;
    logger.info("[Queue] PgBoss closed.");
  }
}
