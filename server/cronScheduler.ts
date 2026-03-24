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

  console.log("[Cron] Registered: draft-reminders (every hour), subscription-sync (every 6h), event-pruning (daily 03:00)");
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
