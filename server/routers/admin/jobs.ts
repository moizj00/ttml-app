import { z } from "zod";
import { adminProcedure } from "../../_core/trpc";
import {
  getFailedJobs,
  purgeFailedJobs,
  getWorkflowJobsByLetterId,
} from "../../db";
import { getPipelineQueue, getBoss, QUEUE_NAME } from "../../queue";
import type { PipelineJobData } from "../../queue";
import { retryPipelineJob } from "../../services/admin";
import { logger } from "../../logger";

export const jobsProcedures = {
  failedJobs: adminProcedure.query(async () => getFailedJobs(100)),

  retryJob: adminProcedure
    .input(
      z.object({
        letterId: z.number(),
        stage: z.enum(["research", "drafting"]),
      })
    )
    .mutation(async ({ input }) => retryPipelineJob(input)),

  purgeFailedJobs: adminProcedure.mutation(async () => {
    const result = await purgeFailedJobs();
    return { success: true, deletedCount: result.deletedCount };
  }),

  queueHealth: adminProcedure.query(async () => {
    try {
      const queue = getPipelineQueue();
      const boss = await getBoss();
      const stats = await boss.getQueueStats(QUEUE_NAME);

      const [
        waiting,
        active,
        completedTotal,
        failed,
        delayed,
        recentFailed,
        recentCompleted,
      ] = await Promise.all([
        queue.getWaitingCount(),
        queue.getActiveCount(),
        queue.getCompletedCount(),
        queue.getFailedCount(),
        queue.getDelayedCount(),
        queue.getFailed(0, 9),
        queue.getCompleted(0, 49), // More samples for better avg + throughput
      ]);

      const failedJobs = recentFailed.map(j => ({
        id: j.id,
        name: j.name,
        failedReason: j.failedReason,
        finishedOn: j.finishedOn,
        data: { type: j.data.type, letterId: j.data.letterId },
      }));

      // Average processing time (last 10 completed)
      const last10Completed = recentCompleted.slice(0, 10);
      const avgProcessingTimeMs =
        last10Completed.length > 0
          ? last10Completed.reduce((sum, j) => {
              const processing = (j.finishedOn ?? 0) - (j.processedOn ?? 0);
              return sum + (processing > 0 ? processing : 0);
            }, 0) / last10Completed.length
          : 0;

      // Throughput: jobs completed in last hour
      const oneHourAgo = Date.now() - 60 * 60 * 1000;
      const throughput1h = recentCompleted.filter(
        j => (j.finishedOn ?? 0) > oneHourAgo
      ).length;

      // Throughput: jobs completed in last 24 hours
      const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
      const throughput24h = recentCompleted.filter(
        j => (j.finishedOn ?? 0) > oneDayAgo
      ).length;

      return {
        pending: waiting,
        active,
        completed: completedTotal,
        failed,
        delayed,
        avgProcessingTimeMs: Math.round(avgProcessingTimeMs),
        throughput1h,
        throughput24h,
        workerConcurrency: parseInt(process.env.WORKER_CONCURRENCY ?? "2", 10),
        jobExpiryMinutes: 60,
        recentFailedJobs: failedJobs,
      };
    } catch (err) {
      logger.error({ err: err }, "[Queue] Health check failed:");
      return {
        pending: 0,
        active: 0,
        completed: 0,
        failed: 0,
        delayed: 0,
        avgProcessingTimeMs: 0,
        throughput1h: 0,
        throughput24h: 0,
        workerConcurrency: parseInt(process.env.WORKER_CONCURRENCY ?? "2", 10),
        jobExpiryMinutes: 60,
        recentFailedJobs: [],
        error: err instanceof Error ? err.message : "Queue health check failed",
      };
    }
  }),
};
