import { getLetterRequestById, updateLetterStatus } from "./db";
import { enqueuePipelineJob } from "./queue";
import { logger } from "./_core/logger";
import { captureServerException } from "./sentry";

const STALE_LOCK_THRESHOLD_MS = 30 * 60 * 1000; // 30 minutes

export async function recoverStalePipelineLocks(): Promise<void> {
  logger.info("[StaleLockRecovery] Checking for stale pipeline locks...");

  const db = await (await import("./db")).getDb();
  if (!db) {
    logger.error("[StaleLockRecovery] Database not initialized.");
    return;
  }

  const { letterRequests } = await import("../drizzle/schema");
  const { eq, and, isNotNull, lt } = await import("drizzle-orm");

  const staleLetters = await db
    .select()
    .from(letterRequests)
    .where(
      and(
        isNotNull(letterRequests.pipelineLockedAt),
        lt(letterRequests.pipelineLockedAt, new Date(Date.now() - STALE_LOCK_THRESHOLD_MS))
      )
    );

  if (staleLetters.length === 0) {
    logger.info("[StaleLockRecovery] No stale pipeline locks found.");
    return;
  }

  logger.warn(`[StaleLockRecovery] Found ${staleLetters.length} stale pipeline locks. Attempting recovery...`);

  for (const letter of staleLetters) {
    try {
      logger.info(`[StaleLockRecovery] Recovering letter #${letter.id} (status: ${letter.status})`);

      // Attempt to re-enqueue the job
      if (letter.intakeJson && letter.userId) {
        await enqueuePipelineJob({
          type: "pipeline:submit",
          letterId: letter.id,
          intake: letter.intakeJson,
          userId: letter.userId,
          appUrl: process.env.APP_BASE_URL || "https://app.talk-to-my-lawyer.com", // Fallback URL
          label: "staleLockRecovery",
          usageContext: { shouldRefundOnFailure: false, isFreeTrialSubmission: false }, // Don\'t refund on recovery
        });
        logger.info(`[StaleLockRecovery] Re-enqueued pipeline job for letter #${letter.id}`);
      } else {
        logger.warn(`[StaleLockRecovery] Cannot re-enqueue letter #${letter.id}: missing intakeJson or userId.`);
      }

      // Clear the lock and set status to submitted so it can be picked up again
      await updateLetterStatus(letter.id, "submitted", { force: true });
      logger.info(`[StaleLockRecovery] Cleared lock and set status to \'submitted\' for letter #${letter.id}`);
    } catch (error) {
      logger.error({ error }, `[StaleLockRecovery] Failed to recover stale lock for letter #${letter.id}:`);
      captureServerException(error, { tags: { component: "stale-lock-recovery", letterId: letter.id } });
    }
  }

  logger.info("[StaleLockRecovery] Stale pipeline lock recovery complete.");
}
