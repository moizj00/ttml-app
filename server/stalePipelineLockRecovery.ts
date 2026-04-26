/**
 * Stale Pipeline Lock Recovery
 *
 * Detects letters that are stuck in `researching` or `drafting` with a
 * `pipelineLockedAt` timestamp older than STALE_LOCK_THRESHOLD_MS (30 minutes).
 *
 * These letters have a stale pipeline lock — the worker process that was
 * processing them died or timed out without releasing the lock. Without
 * intervention they would remain stuck indefinitely.
 *
 * Recovery strategy:
 *   1. Release the stale pipeline lock (set pipelineLockedAt = null)
 *   2. Reset the letter status back to `submitted`
 *   3. Log a review action for the audit trail
 *   4. Re-enqueue the letter for a fresh pipeline run
 *
 * Triggered by the cron scheduler every 15 minutes.
 */

import { getDb } from "./db/core";
import { letterRequests } from "../drizzle/schema";
import { and, inArray, isNotNull, lt } from "drizzle-orm";
import { updateLetterStatus, logReviewAction } from "./db";
import { LETTER_STATUS } from "../shared/types/letter";
import { enqueuePipelineJob } from "./queue";
import { captureServerException } from "./sentry";
import { createLogger } from "./logger";

const recoveryLogger = createLogger({ module: "StaleLockRecovery" });

/** 30 minutes — matches PIPELINE_LOCK_STALE_MS in db/users.ts */
const STALE_LOCK_THRESHOLD_MS = 30 * 60 * 1000;

export interface StaleLockRecoveryResult {
  recovered: number;
  errors: number;
  details: Array<{ letterId: number; previousStatus: string; action: string }>;
}

/**
 * Scans for letters stuck in `researching` or `drafting` with a stale
 * pipeline lock and resets them to `submitted` for a fresh pipeline run.
 */
export async function recoverStalePipelineLocks(): Promise<StaleLockRecoveryResult> {
  const result: StaleLockRecoveryResult = { recovered: 0, errors: 0, details: [] };

  const db = await getDb();
  if (!db) {
    recoveryLogger.warn("[StaleLockRecovery] Database not available — skipping");
    return result;
  }

  const staleThreshold = new Date(Date.now() - STALE_LOCK_THRESHOLD_MS);

  // Find letters stuck in pipeline stages with a stale lock
  const stuckLetters = await db
    .select({
      id: letterRequests.id,
      status: letterRequests.status,
      userId: letterRequests.userId,
      intakeJson: letterRequests.intakeJson,
      pipelineLockedAt: letterRequests.pipelineLockedAt,
    })
    .from(letterRequests)
    .where(
      and(
        inArray(letterRequests.status, [LETTER_STATUS.researching, LETTER_STATUS.drafting]),
        isNotNull(letterRequests.pipelineLockedAt),
        lt(letterRequests.pipelineLockedAt, staleThreshold)
      )
    );

  if (stuckLetters.length === 0) {
    recoveryLogger.info("[StaleLockRecovery] No stuck letters found");
    return result;
  }

  recoveryLogger.warn(
    { count: stuckLetters.length },
    `[StaleLockRecovery] Found ${stuckLetters.length} letter(s) with stale pipeline locks`
  );

  for (const letter of stuckLetters) {
    try {
      const previousStatus = letter.status;

      // 1. Release the stale lock
      await db
        .update(letterRequests)
        .set({ pipelineLockedAt: null })
        .where(and(
          inArray(letterRequests.id, [letter.id]),
          isNotNull(letterRequests.pipelineLockedAt),
          lt(letterRequests.pipelineLockedAt, staleThreshold)
        ));

      // 2. Reset status to submitted (force=true bypasses state machine guard)
      await updateLetterStatus(letter.id, LETTER_STATUS.submitted, { force: true });

      // 3. Log the recovery action for the audit trail
      await logReviewAction({
        letterRequestId: letter.id,
        reviewerId: null as any,
        actorType: "system",
        action: "admin_repair_letter_state",
        noteText: `Auto-recovery: stale pipeline lock detected (locked since ${letter.pipelineLockedAt?.toISOString()}). Status reset from "${previousStatus}" to "${LETTER_STATUS.submitted}" for re-processing.`,
        noteVisibility: "internal",
        fromStatus: previousStatus,
        toStatus: LETTER_STATUS.submitted,
      });

      // 4. Re-enqueue for a fresh pipeline run
      await enqueuePipelineJob({
        type: "runPipeline",
        letterId: letter.id,
        intake: letter.intakeJson,
        userId: letter.userId ?? undefined,
        appUrl: process.env.APP_BASE_URL ?? "https://www.talk-to-my-lawyer.com",
        label: "stale-lock-recovery",
      });

      result.recovered++;
      result.details.push({
        letterId: letter.id,
        previousStatus,
        action: "reset-to-submitted-and-re-enqueued",
      });

      recoveryLogger.info(
        { letterId: letter.id, previousStatus },
        `[StaleLockRecovery] Recovered letter #${letter.id} (was "${previousStatus}") — re-enqueued for pipeline`
      );
    } catch (err) {
      result.errors++;
      recoveryLogger.error(
        { err, letterId: letter.id },
        `[StaleLockRecovery] Failed to recover letter #${letter.id}`
      );
      captureServerException(err, {
        tags: { component: "stale_lock_recovery", letterId: String(letter.id) },
      });
    }
  }

  return result;
}
