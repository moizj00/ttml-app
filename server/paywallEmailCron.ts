/**
 * Draft-Ready Email Cron Handler
 *
 * Queries all letter_requests that:
 *   - Have status = 'generated_locked'
 *   - lastStatusChangedAt is >= 24 hours ago (letter is mature enough to show)
 *   - draft_ready_email_sent = false (not yet notified)
 *   - submittedByAdmin = false
 *
 * For each matching letter, sends sendPaywallNotificationEmail to the subscriber
 * and sets draft_ready_email_sent = true to prevent duplicate sends.
 *
 * Designed to be called by a cron scheduler every 15 minutes, or an external
 * cron service hitting POST /api/cron/paywall-emails with the correct secret.
 *
 * STATUS FLOW CONTEXT:
 *   submitted → researching → drafting → generated_locked → [24h wait]
 *     → email sent → subscriber views watermarked read-only modal
 *     → subscribes / pays → pending_review → under_review → approved
 */

import { and, lt, eq } from "drizzle-orm";
import type { Express, Request, Response } from "express";
import { getDb } from "./db";
import { letterRequests } from "../drizzle/schema";
import { getUserById, isUserFirstLetterEligible } from "./db";
import { sendPaywallNotificationEmail } from "./email";
import { createLogger } from "./logger";

const paywallLogger = createLogger({ module: "PaywallEmails" });

// ─── Configuration ────────────────────────────────────────────────────────────

/** Hours after draft generation before the "Your draft is ready" email fires. */
export const DRAFT_READY_EMAIL_DELAY_HOURS = 24;

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
 * Find all letters eligible for the "Your draft is ready" paywall email and send it.
 * Returns a summary of what happened.
 *
 * Eligibility:
 *   - status = 'generated_locked'
 *   - draft_ready_email_sent = false
 *   - lastStatusChangedAt is older than DRAFT_READY_EMAIL_DELAY_HOURS (24h)
 *   - submittedByAdmin = false
 *
 * Idempotency: draft_ready_email_sent is flipped to true immediately after a
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

  // Letters whose status changed to generated_locked at least 24 hours ago
  const minWaitThreshold = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const eligibleLetters = await db
    .select()
    .from(letterRequests)
    .where(
      and(
        eq(letterRequests.status, "generated_locked"),
        eq(letterRequests.draftReadyEmailSent, false),
        eq(letterRequests.submittedByAdmin, false),
        lt(letterRequests.lastStatusChangedAt, minWaitThreshold)
      )
    );

  paywallLogger.info(
    { count: eligibleLetters.length },
    "[PaywallEmails] Found eligible letters for initial paywall email"
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
          draftReadyEmailSent: true,
          updatedAt: new Date(),
        } as any)
        .where(eq(letterRequests.id, letter.id));

      result.sent++;
      result.details.push({ letterId: letter.id, status: "sent" });
      paywallLogger.info(
        { letterId: letter.id, to: subscriber.email },
        "[PaywallEmails] Paywall notification email sent"
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      result.errors++;
      result.details.push({
        letterId: letter.id,
        status: "error",
        reason: msg,
      });
      paywallLogger.error(
        { letterId: letter.id, err: msg },
        "[PaywallEmails] Failed to send paywall email"
      );
    }
  }

  paywallLogger.info(
    { sent: result.sent, skipped: result.skipped, errors: result.errors },
    "[PaywallEmails] Done"
  );
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
  app.post("/api/cron/paywall-emails", async (req: Request, res: Response) => {
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
      const result = await processPaywallEmails();
      return res.json({ success: true, result });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      paywallLogger.error({ err: msg }, "[PaywallEmails] Cron handler error");
      return res.status(500).json({ error: msg });
    }
  });

  paywallLogger.info(
    {},
    "[PaywallEmails] Route registered: POST /api/cron/paywall-emails"
  );
}
