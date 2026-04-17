/**
 * Paywall Email Cron Handler
 *
 * Queries all letter_requests that:
 *   - Have status = 'generated_locked' (draft ready, not yet paid)
 *   - Were submitted (createdAt) 10–15 minutes ago — the cron window is
 *     anchored to the subscriber's submit time, not to the pipeline
 *     completion time, so the "your draft is ready" nudge always fires
 *     ~10–15 min after submit regardless of pipeline speed.
 *   - Have initial_paywall_email_sent_at IS NULL (email not yet sent)
 *
 * For each matching letter, sends sendPaywallNotificationEmail to the subscriber
 * and stamps initial_paywall_email_sent_at to prevent duplicate sends.
 *
 * Designed to be called by a cron scheduler every 5 minutes, or an external
 * cron service hitting POST /api/cron/paywall-emails with the correct secret.
 *
 * STATUS FLOW CONTEXT:
 *   submitted → researching → drafting → generated_locked → [subscriber pays]
 *     → pending_review → under_review → approved
 *
 * The status filter (generated_locked / generated_unlocked) acts as a safety
 * gate: if the pipeline hasn't finished by the time the cron window opens,
 * we skip the email rather than send a broken "unlock your draft" link.
 * The existing 48-hour sendDraftReminderEmail (draftReminders.ts) continues
 * to fire as a follow-up for subscribers who still haven't acted.
 */

import { inArray, and, isNull, lt, gte, eq } from "drizzle-orm";
import type { Express, Request, Response } from "express";
import { getDb } from "./db";
import { letterRequests } from "../drizzle/schema";
import { getUserById, isUserFirstLetterEligible } from "./db";
import { sendPaywallNotificationEmail } from "./email";
import { createLogger } from "./logger";

const paywallLogger = createLogger({ module: "PaywallEmails" });

// ─── Configuration ────────────────────────────────────────────────────────────

/**
 * Minimum minutes after the subscriber submits before the paywall email fires.
 * The window between MIN and MAX is the cron-job polling window.
 * With a 5-minute cron, use 10 min min / 15 min max so every letter is caught
 * in exactly one cron run.
 */
export const PAYWALL_EMAIL_MIN_DELAY_MINUTES = 10;
export const PAYWALL_EMAIL_MAX_DELAY_MINUTES = 15;

function getAppBaseUrl(): string {
  return process.env.APP_BASE_URL ?? "https://www.talk-to-my-lawyer.com";
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PaywallEmailResult {
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

// ─── Core Logic ───────────────────────────────────────────────────────────────

/**
 * Find all letters eligible for the initial paywall notification email and send it.
 * Returns a summary of what happened.
 *
 * Eligibility:
 *   - status = 'generated_locked' (or legacy 'generated_unlocked')
 *   - initial_paywall_email_sent_at IS NULL
 *   - createdAt is between PAYWALL_EMAIL_MIN_DELAY_MINUTES and
 *     PAYWALL_EMAIL_MAX_DELAY_MINUTES ago (anchored to submit time)
 *   - submittedByAdmin = false
 *
 * Idempotency: initial_paywall_email_sent_at is stamped immediately after a
 * successful send, so re-runs of the cron will not re-send.
 */
export async function processPaywallEmails(): Promise<PaywallEmailResult> {
  const result: PaywallEmailResult = {
    processed: 0,
    sent: 0,
    skipped: 0,
    errors: 0,
    details: [],
  };

  const db = await getDb();
  if (!db) {
    paywallLogger.warn({}, "[PaywallEmails] Database not available — skipping");
    return result;
  }

  const now = Date.now();
  // Letters submitted at least MIN minutes ago (upper bound of createdAt range)
  const minThresholdDate = new Date(now - PAYWALL_EMAIL_MAX_DELAY_MINUTES * 60 * 1000);
  // Letters submitted no more than MAX minutes ago (lower bound of createdAt range)
  const maxThresholdDate = new Date(now - PAYWALL_EMAIL_MIN_DELAY_MINUTES * 60 * 1000);

  // Query: generated_locked (and legacy generated_unlocked) letters whose
  // submit time falls in the 10–15 min window and which have not received
  // a paywall email yet. The status filter is a safety gate — if the
  // pipeline is slow and a letter is still in `researching`/`drafting` when
  // the window opens, we skip it so the email is only sent once a real
  // draft exists. `generated_unlocked` is a legacy status (Phase ≤68).
  const eligibleLetters = await db
    .select()
    .from(letterRequests)
    .where(
      and(
        inArray(letterRequests.status, ["generated_locked", "generated_unlocked"]),
        isNull(letterRequests.initialPaywallEmailSentAt),
        eq(letterRequests.submittedByAdmin, false),
        gte(letterRequests.createdAt, minThresholdDate),
        lt(letterRequests.createdAt, maxThresholdDate)
      )
    );

  paywallLogger.info({ count: eligibleLetters.length }, "[PaywallEmails] Found eligible letters for initial paywall email");
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

      const isFirstLetter = await isUserFirstLetterEligible(letter.userId!);

      await sendPaywallNotificationEmail({
        to: subscriber.email,
        name: subscriber.name ?? "Subscriber",
        subject: letter.subject,
        letterId: letter.id,
        appUrl: appBaseUrl,
        letterType: letter.letterType ?? undefined,
        jurisdictionState: letter.jurisdictionState ?? undefined,
        isFirstLetter,
      });

      // Stamp the email timestamp to prevent re-sending
      await db
        .update(letterRequests)
        .set({
          initialPaywallEmailSentAt: new Date(),
          updatedAt: new Date(),
        } as any)
        .where(eq(letterRequests.id, letter.id));

      result.sent++;
      result.details.push({ letterId: letter.id, status: "sent" });
      paywallLogger.info({ letterId: letter.id, to: subscriber.email }, "[PaywallEmails] Paywall notification email sent");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      result.errors++;
      result.details.push({
        letterId: letter.id,
        status: "error",
        reason: msg,
      });
      paywallLogger.error({ letterId: letter.id, err: msg }, "[PaywallEmails] Failed to send paywall email");
    }
  }

  paywallLogger.info({ sent: result.sent, skipped: result.skipped, errors: result.errors }, "[PaywallEmails] Done");
  return result;
}

// ─── Express Route Registration ───────────────────────────────────────────────

/**
 * Register POST /api/cron/paywall-emails
 *
 * Secured by CRON_SECRET environment variable.
 * Call this endpoint from an external cron service every 5 minutes.
 * The handler is idempotent — letters already emailed are skipped.
 *
 * Headers required:
 *   Authorization: Bearer <CRON_SECRET>
 *
 * Response:
 *   200 { success: true, result: PaywallEmailResult }
 *   401 if secret missing/wrong
 *   500 on unexpected error
 */
export function registerPaywallEmailRoute(app: Express): void {
  app.post(
    "/api/cron/paywall-emails",
    async (req: Request, res: Response) => {
      // ── Auth guard ──────────────────────────────────────────────────────────
      const cronSecret = process.env.CRON_SECRET;
      if (cronSecret) {
        const authHeader = req.headers["authorization"] ?? "";
        const token = authHeader.startsWith("Bearer ")
          ? authHeader.slice(7)
          : "";
        if (token !== cronSecret) {
          return res.status(401).json({ error: "Unauthorized" });
        }
      }

      // ── Run ─────────────────────────────────────────────────────────────────
      try {
        const result = await processPaywallEmails();
        return res.json({ success: true, result });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        paywallLogger.error({ err: msg }, "[PaywallEmails] Cron handler error");
        return res.status(500).json({ error: msg });
      }
    }
  );

  paywallLogger.info({}, "[PaywallEmails] Route registered: POST /api/cron/paywall-emails");
}
