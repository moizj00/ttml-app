/**
 * Cron Scheduler
 *
 * Registers in-process scheduled jobs using node-cron.
 * This runs inside the Express server process — no external scheduler needed.
 *
 * Jobs registered:
 *   - Draft Reminder: every hour at :00 — calls processDraftReminders()
 *   - Subscription Sync: every 6 hours — reconciles local subscription status with Stripe
 *   - Stripe Event Pruning: daily at 03:00 — removes processed webhook events older than 7 days
 *   - Draft-Ready Email Notification: every 15 minutes — sends "Your draft is ready" email to subscribers
 *     whose letter reached generated_locked status ≥24 hours ago (idempotent via draft_ready_email_sent flag)
 *   - Lesson Consolidation: weekly on Sundays at 02:00 — merges similar lessons in scopes with 5+ active lessons
 *   - Lesson Auto-Archival: weekly on Sundays at 02:30 — deactivates stale/ineffective lessons
 *
 * The scheduler is only started in production (NODE_ENV !== 'test').
 * In test environments, jobs are not registered to avoid side effects.
 *
 * Usage:
 *   import { startCronScheduler } from "./cronScheduler";
 *   startCronScheduler(); // call once on server startup
 */

import cron from "node-cron";
import { processDraftReminders } from "./draftReminders";
import {
  syncSubscriptionsWithStripe,
  pruneProcessedStripeEvents,
} from "./subscriptionSync";
import { captureServerException } from "./sentry";
import { releaseStaleReviews } from "./staleReviewReleaser";
import { recoverStalePipelineLocks } from "./stalePipelineLockRecovery";
import { processPaywallEmails } from "./paywallEmailCron";
import { processFreePreviewEmails } from "./freePreviewEmailCron";
import {
  runAutomatedConsolidation,
  archiveIneffectiveLessons,
} from "./learning";
import { logger } from "./logger";
import { getBoss, QUEUE_NAME, isQueueConnectionConfigured } from "./queue";
import type { PipelineJobData } from "./queue";
import { getLetterRequestById } from "./db";

/** Whether the scheduler has been started (prevents double-registration) */
let started = false;

/**
 * Pipeline statuses that legitimately have a queued/deferred job.
 * Jobs for letters in any other status are stale and should be cancelled.
 */
const PIPELINE_ACTIVE_STATUSES = new Set([
  "submitted",
  "researching",
  "drafting",
  "ai_generation_completed_hidden",
]);

/**
 * Cancel any pg-boss pipeline jobs whose associated letter is no longer
 * in an "actively generating" status.  This handles the race where an admin
 * force-transitions a letter but the deferred job wasn't cancelled (or the
 * cancel call failed for a transient reason).
 *
 * Runs at startup and nightly at 04:00.
 */
export async function cleanupStalePipelineJobs(): Promise<{
  cancelled: number;
  errors: number;
}> {
  if (!isQueueConnectionConfigured()) {
    logger.info(
      "[Cron] cleanupStalePipelineJobs: skipped (queue DB URL not configured)"
    );
    return { cancelled: 0, errors: 0 };
  }

  let cancelled = 0;
  let errors = 0;
  try {
    const boss = await getBoss();
    const jobs = await boss.findJobs<PipelineJobData>(QUEUE_NAME);
    const pendingJobs = jobs.filter(
      j => j.state === "created" || j.state === "retry"
    );

    if (pendingJobs.length === 0) return { cancelled: 0, errors: 0 };

    const staleIds: string[] = [];
    for (const job of pendingJobs) {
      const letterId = (job.data as { letterId?: number })?.letterId;
      if (!letterId) continue;
      try {
        const letter = await getLetterRequestById(letterId);
        if (!letter || !PIPELINE_ACTIVE_STATUSES.has(letter.status)) {
          staleIds.push(job.id);
        }
      } catch (err) {
        logger.warn(
          { err, jobId: job.id, letterId },
          "[Cron] cleanupStalePipelineJobs: error checking letter status (skipping job)"
        );
        errors++;
      }
    }

    if (staleIds.length > 0) {
      await boss.cancel(QUEUE_NAME, staleIds);
      cancelled = staleIds.length;
      logger.info(
        { cancelled },
        "[Cron] cleanupStalePipelineJobs: cancelled stale deferred job(s)"
      );
    }
  } catch (err) {
    logger.error(
      { err },
      "[Cron] cleanupStalePipelineJobs: unexpected error"
    );
    errors++;
  }
  return { cancelled, errors };
}

/**
 * Start all scheduled cron jobs.
 * Safe to call multiple times — subsequent calls are no-ops.
 */
export function startCronScheduler(): void {
  if (process.env.NODE_ENV === "test") {
    logger.info("[Cron] Skipping scheduler in test environment");
    return;
  }

  if (started) {
    logger.info("[Cron] Scheduler already running — skipping duplicate start");
    return;
  }

  started = true;
  logger.info("[Cron] Starting scheduler...");

  // Run stale job cleanup once at startup (non-blocking)
  setImmediate(async () => {
    try {
      const result = await cleanupStalePipelineJobs();
      logger.info(
        `[Cron] Startup stale-job cleanup done — cancelled: ${result.cancelled}, errors: ${result.errors}`
      );
    } catch (err) {
      logger.warn({ err }, "[Cron] Startup stale-job cleanup failed (non-fatal)");
    }
  });

  cron.schedule("0 * * * *", async () => {
    const startTime = Date.now();
    logger.info(
      `[Cron] [${new Date().toISOString()}] Running draft reminders...`
    );
    try {
      const result = await processDraftReminders();
      const elapsed = Date.now() - startTime;
      logger.info(
        `[Cron] Draft reminders done in ${elapsed}ms — sent: ${result.sent}, skipped: ${result.skipped}, errors: ${result.errors}`
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error(`[Cron] Draft reminder job failed: ${msg}`);
      captureServerException(err, {
        tags: { component: "cron", job: "draft_reminders" },
      });
    }
  });

  cron.schedule("0 */6 * * *", async () => {
    const startTime = Date.now();
    logger.info(
      `[Cron] [${new Date().toISOString()}] Running subscription sync...`
    );
    try {
      const result = await syncSubscriptionsWithStripe();
      const elapsed = Date.now() - startTime;
      logger.info(
        `[Cron] Subscription sync done in ${elapsed}ms — checked: ${result.checked}, corrected: ${result.corrected}, errors: ${result.errors}`
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error(`[Cron] Subscription sync job failed: ${msg}`);
      captureServerException(err, {
        tags: { component: "cron", job: "subscription_sync" },
      });
    }
  });

  cron.schedule("0 3 * * *", async () => {
    logger.info(
      `[Cron] [${new Date().toISOString()}] Pruning old Stripe events...`
    );
    try {
      const deleted = await pruneProcessedStripeEvents();
      logger.info(`[Cron] Pruned ${deleted} old Stripe events`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error(`[Cron] Stripe event pruning failed: ${msg}`);
      captureServerException(err, {
        tags: { component: "cron", job: "stripe_event_pruning" },
      });
    }
  });

  // Stale review detection: runs every hour at :30
  // Releases letters that have been under_review for 48+ hours back to pending_review
  cron.schedule("30 * * * *", async () => {
    const startTime = Date.now();
    logger.info(
      `[Cron] [${new Date().toISOString()}] Running stale review detection...`
    );
    try {
      const result = await releaseStaleReviews();
      const elapsed = Date.now() - startTime;
      logger.info(
        `[Cron] Stale review detection done in ${elapsed}ms — released: ${result.released}, errors: ${result.errors}`
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error(`[Cron] Stale review detection failed: ${msg}`);
      captureServerException(err, {
        tags: { component: "cron", job: "stale_review_detection" },
      });
    }
  });

  // Draft-ready email notification: runs every 15 minutes.
  // Sends "Your draft is ready — view and submit for review" to subscribers
  // whose letter reached generated_locked status ≥24 hours ago.
  // Idempotent: draft_ready_email_sent = true prevents duplicate sends.
  cron.schedule("*/15 * * * *", async () => {
    const startTime = Date.now();
    logger.info(
      `[Cron] [${new Date().toISOString()}] Running paywall email notifications...`
    );
    try {
      const result = await processPaywallEmails();
      const elapsed = Date.now() - startTime;
      logger.info(
        `[Cron] Paywall emails done in ${elapsed}ms — sent: ${result.sent}, skipped: ${result.skipped}, errors: ${result.errors}`
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error(`[Cron] Paywall email job failed: ${msg}`);
      captureServerException(err, {
        tags: { component: "cron", job: "paywall_emails" },
      });
    }
  });

  // Free-preview-ready email notification: runs every 5 minutes
  // Sends the "your draft is ready to preview" email to subscribers on the
  // first-letter free-preview lead-magnet path, 24 hours after their submit.
  // Idempotent: free_preview_email_sent_at column prevents duplicate sends.
  cron.schedule("*/5 * * * *", async () => {
    const startTime = Date.now();
    logger.info(
      `[Cron] [${new Date().toISOString()}] Running free-preview-ready emails...`
    );
    try {
      const result = await processFreePreviewEmails();
      const elapsed = Date.now() - startTime;
      logger.info(
        `[Cron] Free-preview emails done in ${elapsed}ms — sent: ${result.sent}, skipped: ${result.skipped}, errors: ${result.errors}`
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error(`[Cron] Free-preview email job failed: ${msg}`);
      captureServerException(err, {
        tags: { component: "cron", job: "free_preview_emails" },
      });
    }
  });

  // Lesson consolidation: runs weekly on Sundays at 02:00
  // Iterates over (letter_type, jurisdiction) scopes with 5+ active lessons
  // and merges semantically similar lessons to prevent prompt bloat.
  cron.schedule("0 2 * * 0", async () => {
    const startTime = Date.now();
    logger.info(
      `[Cron] [${new Date().toISOString()}] Running lesson consolidation...`
    );
    try {
      const result = await runAutomatedConsolidation();
      const elapsed = Date.now() - startTime;
      logger.info(
        `[Cron] Lesson consolidation done in ${elapsed}ms — scopes: ${result.scopesProcessed}, consolidated: ${result.totalConsolidated}, deactivated: ${result.totalDeactivated}, errors: ${result.errors}`
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error(`[Cron] Lesson consolidation failed: ${msg}`);
      captureServerException(err, {
        tags: { component: "cron", job: "lesson_consolidation" },
      });
    }
  });

  // Lesson auto-archival: runs weekly on Sundays at 02:30
  // Deactivates stale/ineffective lessons: old with zero injections,
  // proven harmful (after-score < before-score), or low weight with no recent injections.
  cron.schedule("30 2 * * 0", async () => {
    const startTime = Date.now();
    logger.info(
      `[Cron] [${new Date().toISOString()}] Running lesson auto-archival...`
    );
    try {
      const result = await archiveIneffectiveLessons();
      const elapsed = Date.now() - startTime;
      const reasonSummary = Object.entries(result.reasons)
        .map(([r, c]) => `${r}: ${c}`)
        .join(", ");
      logger.info(
        `[Cron] Lesson auto-archival done in ${elapsed}ms — archived: ${result.archived}${reasonSummary ? ` (${reasonSummary})` : ""}`
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error(`[Cron] Lesson auto-archival failed: ${msg}`);
      captureServerException(err, {
        tags: { component: "cron", job: "lesson_archival" },
      });
    }
  });

  // Stale pipeline lock recovery: runs every 15 minutes
  // Detects letters stuck in researching/drafting with a stale pipeline lock
  // and resets them to submitted for a fresh pipeline run.
  cron.schedule("*/15 * * * *", async () => {
    const startTime = Date.now();
    logger.info(
      `[Cron] [${new Date().toISOString()}] Running stale pipeline lock recovery...`
    );
    try {
      const result = await recoverStalePipelineLocks();
      const elapsed = Date.now() - startTime;
      logger.info(
        `[Cron] Stale pipeline lock recovery done in ${elapsed}ms — recovered: ${result.recovered}, errors: ${result.errors}`
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error(`[Cron] Stale pipeline lock recovery failed: ${msg}`);
      captureServerException(err, {
        tags: { component: "cron", job: "stale_pipeline_lock_recovery" },
      });
    }
  });

  // Stale pipeline job cleanup: runs nightly at 04:00
  // Cancels any queued/deferred pg-boss jobs for letters that are no longer
  // in an actively-generating status (guards against missed cancellations).
  cron.schedule("0 4 * * *", async () => {
    const startTime = Date.now();
    logger.info(
      `[Cron] [${new Date().toISOString()}] Running stale pipeline job cleanup...`
    );
    try {
      const result = await cleanupStalePipelineJobs();
      const elapsed = Date.now() - startTime;
      logger.info(
        `[Cron] Stale pipeline job cleanup done in ${elapsed}ms — cancelled: ${result.cancelled}, errors: ${result.errors}`
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error(`[Cron] Stale pipeline job cleanup failed: ${msg}`);
      captureServerException(err, {
        tags: { component: "cron", job: "stale_pipeline_job_cleanup" },
      });
    }
  });

  logger.info(
    "[Cron] Registered: draft-reminders (every hour), subscription-sync (every 6h), event-pruning (daily 03:00), stale-review-detection (every hour at :30), draft-ready-emails (every 15 min / 24h delay), free-preview-emails (every 5 min), lesson-consolidation (weekly Sun 02:00), lesson-archival (weekly Sun 02:30), stale-pipeline-lock-recovery (every 15 min), stale-pipeline-job-cleanup (daily 04:00 + startup)"
  );
}

/**
 * Stop the scheduler (for graceful shutdown).
 * Destroys all registered tasks.
 */
export function stopCronScheduler(): void {
  if (!started) return;
  // node-cron v4 does not expose a global destroy — individual tasks are GC'd
  // when the process exits. This function exists for future extension.
  started = false;
  logger.info("[Cron] Scheduler stopped");
}

/** Exposed for testing */
export { started as _schedulerStarted };
