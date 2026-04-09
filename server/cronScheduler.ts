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
 *   - Paywall Email Notification: every 5 minutes — sends initial paywall email to subscribers
 *     whose letter reached generated_locked status 10–15 minutes ago (idempotent)
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
import { syncSubscriptionsWithStripe, pruneProcessedStripeEvents } from "./subscriptionSync";
import { captureServerException } from "./sentry";
import { releaseStaleReviews } from "./staleReviewReleaser";
import { processPaywallEmails } from "./paywallEmailCron";
import { runAutomatedConsolidation, archiveIneffectiveLessons } from "./learning";
import { logger } from "./logger";

/** Whether the scheduler has been started (prevents double-registration) */
let started = false;

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

  cron.schedule("0 * * * *", async () => {
    const startTime = Date.now();
    logger.info(`[Cron] [${new Date().toISOString()}] Running draft reminders...`);
    try {
      const result = await processDraftReminders();
      const elapsed = Date.now() - startTime;
      logger.info(
        `[Cron] Draft reminders done in ${elapsed}ms — sent: ${result.sent}, skipped: ${result.skipped}, errors: ${result.errors}`
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error(`[Cron] Draft reminder job failed: ${msg}`);
      captureServerException(err, { tags: { component: "cron", job: "draft_reminders" } });
    }
  });

  cron.schedule("0 */6 * * *", async () => {
    const startTime = Date.now();
    logger.info(`[Cron] [${new Date().toISOString()}] Running subscription sync...`);
    try {
      const result = await syncSubscriptionsWithStripe();
      const elapsed = Date.now() - startTime;
      logger.info(
        `[Cron] Subscription sync done in ${elapsed}ms — checked: ${result.checked}, corrected: ${result.corrected}, errors: ${result.errors}`
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error(`[Cron] Subscription sync job failed: ${msg}`);
      captureServerException(err, { tags: { component: "cron", job: "subscription_sync" } });
    }
  });

  cron.schedule("0 3 * * *", async () => {
    logger.info(`[Cron] [${new Date().toISOString()}] Pruning old Stripe events...`);
    try {
      const deleted = await pruneProcessedStripeEvents();
      logger.info(`[Cron] Pruned ${deleted} old Stripe events`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error(`[Cron] Stripe event pruning failed: ${msg}`);
      captureServerException(err, { tags: { component: "cron", job: "stripe_event_pruning" } });
    }
  });

  // Stale review detection: runs every hour at :30
  // Releases letters that have been under_review for 48+ hours back to pending_review
  cron.schedule("30 * * * *", async () => {
    const startTime = Date.now();
    logger.info(`[Cron] [${new Date().toISOString()}] Running stale review detection...`);
    try {
      const result = await releaseStaleReviews();
      const elapsed = Date.now() - startTime;
      logger.info(
        `[Cron] Stale review detection done in ${elapsed}ms — released: ${result.released}, errors: ${result.errors}`
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error(`[Cron] Stale review detection failed: ${msg}`);
      captureServerException(err, { tags: { component: "cron", job: "stale_review_detection" } });
    }
  });

  // Paywall email notification: runs every 5 minutes
  // Sends the initial "your draft is ready — unlock it" email to subscribers
  // whose letter reached generated_locked status 10–15 minutes ago.
  // Idempotent: initial_paywall_email_sent_at column prevents duplicate sends.
  cron.schedule("*/5 * * * *", async () => {
    const startTime = Date.now();
    logger.info(`[Cron] [${new Date().toISOString()}] Running paywall email notifications...`);
    try {
      const result = await processPaywallEmails();
      const elapsed = Date.now() - startTime;
      logger.info(
        `[Cron] Paywall emails done in ${elapsed}ms — sent: ${result.sent}, skipped: ${result.skipped}, errors: ${result.errors}`
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error(`[Cron] Paywall email job failed: ${msg}`);
      captureServerException(err, { tags: { component: "cron", job: "paywall_emails" } });
    }
  });

  // Lesson consolidation: runs weekly on Sundays at 02:00
  // Iterates over (letter_type, jurisdiction) scopes with 5+ active lessons
  // and merges semantically similar lessons to prevent prompt bloat.
  cron.schedule("0 2 * * 0", async () => {
    const startTime = Date.now();
    logger.info(`[Cron] [${new Date().toISOString()}] Running lesson consolidation...`);
    try {
      const result = await runAutomatedConsolidation();
      const elapsed = Date.now() - startTime;
      logger.info(
        `[Cron] Lesson consolidation done in ${elapsed}ms — scopes: ${result.scopesProcessed}, consolidated: ${result.totalConsolidated}, deactivated: ${result.totalDeactivated}, errors: ${result.errors}`
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error(`[Cron] Lesson consolidation failed: ${msg}`);
      captureServerException(err, { tags: { component: "cron", job: "lesson_consolidation" } });
    }
  });

  // Lesson auto-archival: runs weekly on Sundays at 02:30
  // Deactivates stale/ineffective lessons: old with zero injections,
  // proven harmful (after-score < before-score), or low weight with no recent injections.
  cron.schedule("30 2 * * 0", async () => {
    const startTime = Date.now();
    logger.info(`[Cron] [${new Date().toISOString()}] Running lesson auto-archival...`);
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
      captureServerException(err, { tags: { component: "cron", job: "lesson_archival" } });
    }
  });

  logger.info("[Cron] Registered: draft-reminders (every hour), subscription-sync (every 6h), event-pruning (daily 03:00), stale-review-detection (every hour at :30), paywall-emails (every 5 min), lesson-consolidation (weekly Sun 02:00), lesson-archival (weekly Sun 02:30)");
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
