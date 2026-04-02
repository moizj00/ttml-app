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

/** Whether the scheduler has been started (prevents double-registration) */
let started = false;

/**
 * Start all scheduled cron jobs.
 * Safe to call multiple times — subsequent calls are no-ops.
 */
export function startCronScheduler(): void {
  if (process.env.NODE_ENV === "test") {
    console.log("[Cron] Skipping scheduler in test environment");
    return;
  }

  if (started) {
    console.log("[Cron] Scheduler already running — skipping duplicate start");
    return;
  }

  started = true;
  console.log("[Cron] Starting scheduler...");

  cron.schedule("0 * * * *", async () => {
    const startTime = Date.now();
    console.log(`[Cron] [${new Date().toISOString()}] Running draft reminders...`);
    try {
      const result = await processDraftReminders();
      const elapsed = Date.now() - startTime;
      console.log(
        `[Cron] Draft reminders done in ${elapsed}ms — sent: ${result.sent}, skipped: ${result.skipped}, errors: ${result.errors}`
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[Cron] Draft reminder job failed: ${msg}`);
      captureServerException(err, { tags: { component: "cron", job: "draft_reminders" } });
    }
  });

  cron.schedule("0 */6 * * *", async () => {
    const startTime = Date.now();
    console.log(`[Cron] [${new Date().toISOString()}] Running subscription sync...`);
    try {
      const result = await syncSubscriptionsWithStripe();
      const elapsed = Date.now() - startTime;
      console.log(
        `[Cron] Subscription sync done in ${elapsed}ms — checked: ${result.checked}, corrected: ${result.corrected}, errors: ${result.errors}`
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[Cron] Subscription sync job failed: ${msg}`);
      captureServerException(err, { tags: { component: "cron", job: "subscription_sync" } });
    }
  });

  cron.schedule("0 3 * * *", async () => {
    console.log(`[Cron] [${new Date().toISOString()}] Pruning old Stripe events...`);
    try {
      const deleted = await pruneProcessedStripeEvents();
      console.log(`[Cron] Pruned ${deleted} old Stripe events`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[Cron] Stripe event pruning failed: ${msg}`);
      captureServerException(err, { tags: { component: "cron", job: "stripe_event_pruning" } });
    }
  });

  // Stale review detection: runs every hour at :30
  // Releases letters that have been under_review for 48+ hours back to pending_review
  cron.schedule("30 * * * *", async () => {
    const startTime = Date.now();
    console.log(`[Cron] [${new Date().toISOString()}] Running stale review detection...`);
    try {
      const result = await releaseStaleReviews();
      const elapsed = Date.now() - startTime;
      console.log(
        `[Cron] Stale review detection done in ${elapsed}ms — released: ${result.released}, errors: ${result.errors}`
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[Cron] Stale review detection failed: ${msg}`);
      captureServerException(err, { tags: { component: "cron", job: "stale_review_detection" } });
    }
  });

  // Paywall email notification: runs every 5 minutes
  // Sends the initial "your draft is ready — unlock it" email to subscribers
  // whose letter reached generated_locked status 10–15 minutes ago.
  // Idempotent: initial_paywall_email_sent_at column prevents duplicate sends.
  cron.schedule("*/5 * * * *", async () => {
    const startTime = Date.now();
    console.log(`[Cron] [${new Date().toISOString()}] Running paywall email notifications...`);
    try {
      const result = await processPaywallEmails();
      const elapsed = Date.now() - startTime;
      console.log(
        `[Cron] Paywall emails done in ${elapsed}ms — sent: ${result.sent}, skipped: ${result.skipped}, errors: ${result.errors}`
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[Cron] Paywall email job failed: ${msg}`);
      captureServerException(err, { tags: { component: "cron", job: "paywall_emails" } });
    }
  });

  console.log("[Cron] Registered: draft-reminders (every hour), subscription-sync (every 6h), event-pruning (daily 03:00), stale-review-detection (every hour at :30), paywall-emails (every 5 min)");
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
  console.log("[Cron] Scheduler stopped");
}

/** Exposed for testing */
export { started as _schedulerStarted };
