import { z } from "zod";
import { adminProcedure } from "../../_core/trpc";
import {
  getFailedJobs,
  purgeFailedJobs,
  getWorkflowJobsByLetterId,
} from "../../db";
import { getPipelineQueue } from "../../queue";
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
      const [waiting, active, completed, failed, delayed] = await Promise.all([
        queue.getWaitingCount(),
        queue.getActiveCount(),
        queue.getCompletedCount(),
        queue.getFailedCount(),
        queue.getDelayedCount(),
      ]);

      const recentFailed = await queue.getFailed(0, 9);
      const failedJobs = recentFailed.map(j => ({
        id: j.id,
        name: j.name,
        failedReason: j.failedReason,
        finishedOn: j.finishedOn,
        data: { type: j.data.type, letterId: j.data.letterId },
      }));

      const recentCompleted = await queue.getCompleted(0, 9);
      const avgProcessingTimeMs = recentCompleted.length > 0
        ? recentCompleted.reduce((sum, j) => {
            const processing = (j.finishedOn ?? 0) - (j.processedOn ?? 0);
            return sum + (processing > 0 ? processing : 0);
          }, 0) / recentCompleted.length
        : 0;

      return {
        pending: waiting,
        active,
        completed,
        failed,
        delayed,
        avgProcessingTimeMs: Math.round(avgProcessingTimeMs),
        recentFailedJobs: failedJobs,
      };
    } catch (err) {
      logger.error("[Queue] Health check failed:", err);
      return {
        pending: 0,
        active: 0,
        completed: 0,
        failed: 0,
        delayed: 0,
        avgProcessingTimeMs: 0,
        recentFailedJobs: [],
        error: err instanceof Error ? err.message : "Queue health check failed",
      };
    }
  }),
};
