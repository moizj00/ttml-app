/**
 * Free-Preview Email Cron Handler
 *
 * Queries all letter_requests that are on the first-letter free-preview
 * lead-magnet path and whose 24-hour cooling-off window has elapsed:
 *
 *   - is_free_preview = TRUE
 *   - free_preview_unlock_at <= NOW()
 *   - free_preview_email_sent_at IS NULL
 *
 * For each matching letter, sends sendFreePreviewReadyEmail to the subscriber
 * and stamps free_preview_email_sent_at to prevent duplicate sends.
 *
 * Designed to be called by the in-process cron scheduler every 5 minutes, or an
 * external cron service hitting POST /api/cron/free-preview-emails with the
 * correct CRON_SECRET.
 *
 * STATUS CONTEXT:
 *   The subscriber submits via the free-trial path, the pipeline runs in
 *   background, and 24 hours later this cron fires a "your draft is ready to
 *   preview" email. The preview reveals the FULL ai_draft (no truncation,
 *   no PII redaction) — the only anti-abuse protection is client-side:
 *   non-selectable content + DRAFT watermark + subscribe-to-send CTA.
 *
 *   The dispatcher requires a saved ai_draft before it sends (`requireDraft:
 *   true`). If the pipeline is still running when the 24h window elapses,
 *   the cron skips this tick and retries on the next; the subscriber never
 *   receives a "your preview is ready" email for a letter with no draft to
 *   show. A `pipeline_failed` letter is likewise skipped when no draft was
 *   saved, but it can still trigger the email when a draft exists because
 *   `pipeline_failed` remains in `FREE_PREVIEW_ELIGIBLE_STATUSES` — a
 *   partially-completed pipeline run that produced a usable draft should
 *   still surface it to the subscriber.
 */

import { and, isNull, isNotNull, lte, eq, inArray } from "drizzle-orm";
import type { Express, Request, Response } from "express";
import { getDb } from "./db";
import { letterRequests } from "../drizzle/schema";
import { getUserById } from "./db";
import { sendFreePreviewReadyEmail } from "./email";
import { createLogger } from "./logger";

const freePreviewLogger = createLogger({ module: "FreePreviewEmails" });

/**
 * Letter statuses for which the free-preview "your draft is ready to preview"
 * email is still meaningful. Once a letter advances past these (i.e. the
 * subscriber paid early or an attorney started reviewing), the cron and the
 * admin force-unlock mutation must NOT fire the email — the subscriber is
 * already seeing the attorney-review flow and a stale "preview ready" email
 * would collide with it.
 *
 * `pipeline_failed` is intentionally included: a partially-completed pipeline
 * run that still saved an ai_draft should surface to the subscriber. With
 * `requireDraft: true` the atomic claim will skip the email when no draft
 * exists; if one does, the subscriber sees the draft with a failure banner.
 *
 * Exported so server/routers/admin/letters.ts can use the same allow-list for
 * its `forceFreePreviewUnlock` status guard — single source of truth.
 */
export const FREE_PREVIEW_ELIGIBLE_STATUSES = [
  // Pipeline still running
  "submitted",
  "researching",
  "drafting",
  // NEW: pipeline done, 24h hold active — the most common state when cron fires
  "ai_generation_completed_hidden",
  // 24h window elapsed — subscriber can view but hasn't paid yet
  "letter_released_to_subscriber",
  "attorney_review_upsell_shown",
  "attorney_review_checkout_started",
  // Legacy statuses (pre-redesign) — kept for backward compat
  "generated_locked",
  // Pipeline failed — still email subscriber so they aren't left wondering
  "pipeline_failed",
] as const;

// ─── Configuration ────────────────────────────────────────────────────────────

function getAppBaseUrl(): string {
  return process.env.APP_BASE_URL ?? "https://www.talk-to-my-lawyer.com";
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface FreePreviewEmailResult {
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

export interface DispatchFreePreviewResult {
  status: "sent" | "skipped" | "error";
  reason?: string;
}

// ─── Atomic Dispatcher ────────────────────────────────────────────────────────

/**
 * Atomically claim and send the "your free preview is ready" email for a
 * single letter. This is the single source of truth invoked from three
 * concurrent call sites:
 *
 *   1. The polling cron (`processFreePreviewEmails`, runs every 5 min)
 *   2. The pipeline finalize sites (simple, LangGraph, fallback) immediately
 *      after a draft is saved and status reaches `generated_locked`
 *   3. The admin `forceFreePreviewUnlock` mutation, which collapses the 24h
 *      cooling window to "now"
 *
 * Concurrency safety:
 *   The eligibility check and the `freePreviewEmailSentAt` stamp happen in a
 *   single conditional UPDATE ... RETURNING. Only one concurrent caller gets
 *   the row back — everyone else sees zero rows and returns `skipped`. If the
 *   email send throws, we roll the stamp back to NULL so the cron retries on
 *   its next tick.
 *
 * Eligibility gates (all must hold):
 *   - `is_free_preview = TRUE`                            (on the lead-magnet path)
 *   - `free_preview_email_sent_at IS NULL`                (not already sent)
 *   - `free_preview_unlock_at <= NOW()`                   (cooling window elapsed OR admin-forced)
 *   - `current_ai_draft_version_id IS NOT NULL`           (draft exists)  — ONLY if requireDraft
 *
 * `requireDraft` default is TRUE so the pipeline-finalize and admin-force
 * paths never fire a "preview ready" email before the draft is saved. The
 * polling cron passes `requireDraft: false` to preserve the documented
 * "still email if pipeline failed so subscriber is informed" behavior.
 */
export async function dispatchFreePreviewIfReady(
  letterId: number,
  opts: { requireDraft?: boolean } = {}
): Promise<DispatchFreePreviewResult> {
  const requireDraft = opts.requireDraft ?? true;

  const db = await getDb();
  if (!db) {
    return { status: "skipped", reason: "database unavailable" };
  }

  const now = new Date();

  // Atomic claim. If another caller beats us to the stamp, the WHERE clause
  // no longer matches and RETURNING is empty — we skip without side effects.
  // The status filter prevents the email from firing once a subscriber has
  // paid early (letter transitioned to `pending_review` or beyond) — the
  // dispatcher would otherwise happily send a "preview is ready" email for
  // a letter that's already with an attorney or delivered.
  const claimFilters = [
    eq(letterRequests.id, letterId),
    eq(letterRequests.isFreePreview, true),
    isNull(letterRequests.freePreviewEmailSentAt),
    lte(letterRequests.freePreviewUnlockAt, now),
    inArray(
      letterRequests.status,
      FREE_PREVIEW_ELIGIBLE_STATUSES as unknown as any[]
    ),
  ];
  if (requireDraft) {
    claimFilters.push(isNotNull(letterRequests.currentAiDraftVersionId));
  }

  const claimed = await db
    .update(letterRequests)
    .set({
      freePreviewEmailSentAt: now,
      updatedAt: now,
    } as any)
    .where(and(...claimFilters))
    .returning();

  if (claimed.length === 0) {
    return { status: "skipped", reason: "not eligible yet" };
  }

  const letter = claimed[0];

  try {
    if (letter.userId == null) {
      await rollbackFreePreviewClaim(letterId);
      return { status: "skipped", reason: "no user associated" };
    }
    const subscriber = await getUserById(letter.userId);
    if (!subscriber?.email) {
      await rollbackFreePreviewClaim(letterId);
      return { status: "skipped", reason: "no subscriber email" };
    }

    await sendFreePreviewReadyEmail({
      to: subscriber.email,
      name: subscriber.name ?? "Subscriber",
      subject: letter.subject,
      letterId: letter.id,
      appUrl: getAppBaseUrl(),
      letterType: letter.letterType ?? undefined,
      jurisdictionState: letter.jurisdictionState ?? undefined,
    });

    freePreviewLogger.info(
      { letterId, to: subscriber.email },
      "[FreePreviewEmails] Free-preview-ready email dispatched"
    );
    return { status: "sent" };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // Roll back the stamp so the cron retries this letter on its next tick.
    // If the rollback itself fails the letter is stranded — log loudly so
    // ops can investigate, but don't rethrow (we still want the calling
    // pipeline/admin path to succeed overall).
    await rollbackFreePreviewClaim(letterId).catch((e) =>
      freePreviewLogger.error(
        { letterId, err: e },
        "[FreePreviewEmails] Rollback after send failure also failed — letter may be stranded"
      )
    );
    freePreviewLogger.error(
      { letterId, err: msg },
      "[FreePreviewEmails] Failed to dispatch free-preview-ready email"
    );
    return { status: "error", reason: msg };
  }
}

async function rollbackFreePreviewClaim(letterId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db
    .update(letterRequests)
    .set({
      freePreviewEmailSentAt: null,
      updatedAt: new Date(),
    } as any)
    .where(eq(letterRequests.id, letterId));
}

// ─── Core Logic ───────────────────────────────────────────────────────────────

/**
 * Find all letters due for the free-preview-ready email and send it.
 * Returns a summary of what happened.
 *
 * Eligibility:
 *   - is_free_preview = TRUE
 *   - free_preview_unlock_at <= NOW() (24h cooling-off window has elapsed)
 *   - free_preview_email_sent_at IS NULL (email not yet sent)
 *
 * Idempotency: free_preview_email_sent_at is stamped immediately after a
 * successful send, so re-runs of the cron will not re-send. The stamp happens
 * in a single UPDATE after the email await resolves — if the send fails the
 * stamp is not applied and the letter will be retried on the next cron tick.
 */
export async function processFreePreviewEmails(): Promise<FreePreviewEmailResult> {
  const result: FreePreviewEmailResult = {
    processed: 0,
    sent: 0,
    skipped: 0,
    errors: 0,
    details: [],
  };

  const db = await getDb();
  if (!db) {
    freePreviewLogger.warn({}, "[FreePreviewEmails] Database not available — skipping");
    return result;
  }

  const now = new Date();

  // Query: free-preview letters whose 24h unlock time has passed and which
  // have not yet received the preview-ready email. Uses the partial index
  // `idx_letter_requests_free_preview_due` created in migration 0048.
  const eligibleLetters = await db
    .select()
    .from(letterRequests)
    .where(
      and(
        eq(letterRequests.isFreePreview, true),
        isNull(letterRequests.freePreviewEmailSentAt),
        lte(letterRequests.freePreviewUnlockAt, now),
        // Skip letters that have progressed past the pre-review band (e.g.
        // subscriber paid early, attorney already reviewing). The dispatcher
        // also enforces this, but filtering here avoids wasted work.
        inArray(
          letterRequests.status,
          FREE_PREVIEW_ELIGIBLE_STATUSES as unknown as any[]
        )
      )
    );

  freePreviewLogger.info(
    { count: eligibleLetters.length },
    "[FreePreviewEmails] Found letters due for free-preview-ready email"
  );
  result.processed = eligibleLetters.length;

  // Delegate per-letter dispatch to the shared atomic helper. `requireDraft`
  // is TRUE everywhere now: sending a "your preview is ready" email when no
  // draft exists lands the subscriber on an empty page and wastes the
  // conversion moment. If the pipeline is slow the cron retries on the next
  // tick once the draft is saved. `pipeline_failed` letters are skipped
  // when no draft was saved, but can still fire the email if a usable draft
  // was persisted before the failure (see FREE_PREVIEW_ELIGIBLE_STATUSES).
  for (const letter of eligibleLetters) {
    const dispatchResult = await dispatchFreePreviewIfReady(letter.id, {
      requireDraft: true,
    });

    if (dispatchResult.status === "sent") {
      result.sent++;
      result.details.push({ letterId: letter.id, status: "sent" });
    } else if (dispatchResult.status === "skipped") {
      result.skipped++;
      result.details.push({
        letterId: letter.id,
        status: "skipped",
        reason: dispatchResult.reason,
      });
    } else {
      result.errors++;
      result.details.push({
        letterId: letter.id,
        status: "error",
        reason: dispatchResult.reason,
      });
    }
  }

  freePreviewLogger.info(
    { sent: result.sent, skipped: result.skipped, errors: result.errors },
    "[FreePreviewEmails] Done"
  );
  return result;
}

// ─── Express Route Registration ───────────────────────────────────────────────

/**
 * Register POST /api/cron/free-preview-emails
 *
 * Secured by CRON_SECRET environment variable.
 * Call this endpoint from an external cron service (or rely on the in-process
 * cron scheduler, which runs the same processFreePreviewEmails() every 5 min).
 * The handler is idempotent — letters already emailed are skipped.
 *
 * Headers required:
 *   Authorization: Bearer <CRON_SECRET>
 *
 * Response:
 *   200 { success: true, result: FreePreviewEmailResult }
 *   401 if secret missing/wrong
 *   500 on unexpected error
 */
export function registerFreePreviewEmailRoute(app: Express): void {
  app.post(
    "/api/cron/free-preview-emails",
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
        const result = await processFreePreviewEmails();
        return res.json({ success: true, result });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        freePreviewLogger.error(
          { err: msg },
          "[FreePreviewEmails] Cron handler error"
        );
        return res.status(500).json({ error: msg });
      }
    }
  );

  freePreviewLogger.info(
    {},
    "[FreePreviewEmails] Route registered: POST /api/cron/free-preview-emails"
  );
}
