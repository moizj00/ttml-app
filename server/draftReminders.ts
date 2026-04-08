/**
 * Draft Reminder Cron Handler
 *
 * Queries all letter_requests that:
 *   - Have status = 'generated_locked' (draft ready, not yet paid)
 *   - Were last updated (or created) more than REMINDER_THRESHOLD_HOURS ago
 *   - Have draft_reminder_sent_at IS NULL (reminder not yet sent)
 *
 * For each matching letter, sends sendDraftReminderEmail to the subscriber
 * and stamps draft_reminder_sent_at to prevent duplicate sends.
 *
 * Designed to be called by a cron scheduler (e.g. every hour) or an external
 * cron service hitting POST /api/cron/draft-reminders with the correct secret.
 */

import { inArray, and, isNull, lt, eq } from "drizzle-orm";
import type { Express, Request, Response } from "express";
import { getDb } from "./db";
import { letterRequests } from "../drizzle/schema";
import { getUserById } from "./db";
import { sendDraftReminderEmail } from "./email";
import { logger } from "./logger";

// ─── Configuration ────────────────────────────────────────────────────────────

/** Hours after draft-ready before the reminder fires */
export const REMINDER_THRESHOLD_HOURS = 48;

/** App base URL (falls back to production domain) */
function getAppBaseUrl(): string {
  // Use the canonical production domain if set, otherwise fall back to the known domain
  return process.env.APP_BASE_URL ?? "https://www.talk-to-my-lawyer.com";
}

// ─── Core Logic ───────────────────────────────────────────────────────────────

export interface ReminderResult {
  processed: number;
  sent: number;
  skipped: number;
  errors: number;
  details: Array<{
    letterId: number;
    status: "sent" | "skipped" | "error";
    reason?: string;
  }>;
}

/**
 * Find all letters eligible for a reminder and send the email.
 * Returns a summary of what happened.
 */
export async function processDraftReminders(): Promise<ReminderResult> {
  const result: ReminderResult = {
    processed: 0,
    sent: 0,
    skipped: 0,
    errors: 0,
    details: [],
  };

  const db = await getDb();
  if (!db) {
    logger.warn("[DraftReminders] Database not available — skipping");
    return result;
  }

  const thresholdDate = new Date(
    Date.now() - REMINDER_THRESHOLD_HOURS * 60 * 60 * 1000
  );

  // Query: generated_locked (and legacy generated_unlocked) letters older than
  // threshold with no reminder sent yet.
  // generated_unlocked is a legacy status (Phase ≤68) treated identically.
  const eligibleLetters = await db
    .select()
    .from(letterRequests)
    .where(
      and(
        inArray(letterRequests.status, ["generated_locked", "generated_unlocked"]),
        isNull(letterRequests.draftReminderSentAt),
        eq(letterRequests.submittedByAdmin, false),
        lt(letterRequests.updatedAt, thresholdDate)
      )
    );

  logger.info(
    `[DraftReminders] Found ${eligibleLetters.length} eligible letters for reminder`
  );
  result.processed = eligibleLetters.length;

  const appBaseUrl = getAppBaseUrl();

  for (const letter of eligibleLetters) {
    try {
      if (letter.userId == null) {
        result.skipped++;
        result.details.push({
          letterId: letter.id,
          status: "skipped",
          reason: "no user associated",
        });
        continue;
      }
      const subscriber = await getUserById(letter.userId);

      if (!subscriber?.email) {
        result.skipped++;
        result.details.push({
          letterId: letter.id,
          status: "skipped",
          reason: "no subscriber email",
        });
        continue;
      }

      // Calculate how long the draft has been waiting
      const hoursWaiting =
        (Date.now() - letter.updatedAt.getTime()) / (1000 * 60 * 60);

      // Send the reminder email
      await sendDraftReminderEmail({
        to: subscriber.email,
        name: subscriber.name ?? "Subscriber",
        subject: letter.subject,
        letterId: letter.id,
        appUrl: appBaseUrl,
        letterType: letter.letterType ?? undefined,
        jurisdictionState: letter.jurisdictionState ?? undefined,
        hoursWaiting,
      });

      // Stamp the reminder timestamp to prevent re-sending
      await db
        .update(letterRequests)
        .set({ draftReminderSentAt: new Date(), updatedAt: new Date() } as any)
        .where(eq(letterRequests.id, letter.id));

      result.sent++;
      result.details.push({ letterId: letter.id, status: "sent" });
      logger.info(
        `[DraftReminders] Reminder sent for letter #${letter.id} to ${subscriber.email} (${Math.round(hoursWaiting)}h waiting)`
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      result.errors++;
      result.details.push({
        letterId: letter.id,
        status: "error",
        reason: msg,
      });
      logger.error({ msg: msg }, `[DraftReminders] Failed to send reminder for letter #${letter.id}:`);
    }
  }

  logger.info(
    `[DraftReminders] Done — sent: ${result.sent}, skipped: ${result.skipped}, errors: ${result.errors}`
  );
  return result;
}

// ─── Express Route Registration ───────────────────────────────────────────────

/**
 * Register POST /api/cron/draft-reminders
 *
 * Secured by CRON_SECRET environment variable.
 * Call this endpoint from an external cron service (e.g. cron-job.org, GitHub Actions)
 * every hour. The handler is idempotent — letters already reminded are skipped.
 *
 * Headers required:
 *   Authorization: Bearer <CRON_SECRET>
 *
 * Response:
 *   200 { success: true, result: ReminderResult }
 *   401 if secret missing/wrong
 *   500 on unexpected error
 */
export function registerDraftRemindersRoute(app: Express): void {
  app.post("/api/cron/draft-reminders", async (req: Request, res: Response) => {
    // ── Auth guard ──────────────────────────────────────────────────────────
    const cronSecret = process.env.CRON_SECRET;
    if (cronSecret) {
      const authHeader = req.headers["authorization"] ?? "";
      const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
      if (token !== cronSecret) {
        return res.status(401).json({ error: "Unauthorized" });
      }
    }
    // ── Run ─────────────────────────────────────────────────────────────────
    try {
      const result = await processDraftReminders();
      return res.json({ success: true, result });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error({ msg: msg }, "[DraftReminders] Cron handler error:");
      return res.status(500).json({ error: msg });
    }
  });

  logger.info(
    "[DraftReminders] Route registered: POST /api/cron/draft-reminders"
  );
}
