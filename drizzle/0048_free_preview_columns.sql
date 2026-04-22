-- Migration 0048: free_preview_columns
-- Adds first-letter free-preview lead-magnet columns to letter_requests.
--
-- Flow:
--   1. Subscriber submits first letter → is_free_preview = TRUE, free_preview_unlock_at = now() + 24h
--   2. Pipeline generates draft as usual (status → generated_locked)
--   3. A polling cron (every 5 min) finds letters where:
--        is_free_preview = TRUE
--        AND free_preview_unlock_at <= now()
--        AND free_preview_email_sent_at IS NULL
--      → sends the "your draft is ready (unreviewed) — preview it" email and stamps
--        free_preview_email_sent_at to prevent duplicate sends.
--   4. Subscriber clicks the email → a tRPC read returns the FULL ai_draft (no truncation,
--      no PII redaction) because the letter is marked is_free_preview AND
--      free_preview_unlock_at has passed. Content is rendered non-selectable with
--      a DRAFT watermark in the UI.
--   5. Subscriber clicks "Submit For Attorney Review" → redirected to the subscribe flow.
--
-- These columns are strictly ADDITIVE — all existing letter-flow logic is unaffected
-- unless a letter opts into the free-preview path via is_free_preview = TRUE.
--
-- Uses IF NOT EXISTS — safe to apply against a database that already has some
-- or all of these columns (e.g. applied ad-hoc during an earlier patch).

--> statement-breakpoint
ALTER TABLE "letter_requests" ADD COLUMN IF NOT EXISTS "is_free_preview" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "letter_requests" ADD COLUMN IF NOT EXISTS "free_preview_unlock_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "letter_requests" ADD COLUMN IF NOT EXISTS "free_preview_email_sent_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "letter_requests" ADD COLUMN IF NOT EXISTS "free_preview_viewed_at" timestamp with time zone;

--> statement-breakpoint
-- Composite partial index for the free-preview email scheduler — covers the exact
-- WHERE clause used by processFreePreviewEmails() so the scheduler polls cheaply
-- even with millions of historical letters.
CREATE INDEX IF NOT EXISTS "idx_letter_requests_free_preview_due"
  ON "letter_requests" ("free_preview_unlock_at")
  WHERE "is_free_preview" = true AND "free_preview_email_sent_at" IS NULL;
