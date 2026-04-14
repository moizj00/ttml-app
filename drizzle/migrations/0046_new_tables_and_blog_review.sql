-- ═══════════════════════════════════════════════════════════════════════════════
-- Migration 0046: new tables + blog_posts review columns
--
-- Adds:
--   1. letter_delivery_log   — tracks every outbound delivery to the recipient
--   2. client_portal_tokens  — time-limited tokens for the recipient portal view
--   3. letter_analytics      — per-letter pipeline performance & cost data
--   4. blog_posts.reviewed_by / reviewed_at  — admin sign-off before publish
-- ═══════════════════════════════════════════════════════════════════════════════

--> statement-breakpoint

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. letter_delivery_log
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "letter_delivery_log" (
  "id"                 serial          PRIMARY KEY,
  "letter_request_id"  integer         NOT NULL
    REFERENCES "letter_requests"("id") ON DELETE CASCADE,
  "recipient_email"    varchar(320),
  "recipient_name"     varchar(500),
  "delivery_method"    varchar(50)     NOT NULL DEFAULT 'email',
  "delivery_status"    varchar(50)     NOT NULL DEFAULT 'pending',
  "resend_message_id"  varchar(255),
  "delivered_at"       timestamptz,
  "created_at"         timestamptz     NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_letter_delivery_log_request_id"
  ON "letter_delivery_log" ("letter_request_id");

--> statement-breakpoint

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. client_portal_tokens
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "client_portal_tokens" (
  "id"                 serial          PRIMARY KEY,
  "letter_request_id"  integer         NOT NULL
    REFERENCES "letter_requests"("id") ON DELETE CASCADE,
  "token"              varchar(64)     NOT NULL UNIQUE,
  "recipient_email"    varchar(320),
  "recipient_name"     varchar(500),
  "expires_at"         timestamptz     NOT NULL,
  "viewed_at"          timestamptz,
  "created_at"         timestamptz     NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_client_portal_tokens_letter_request_id"
  ON "client_portal_tokens" ("letter_request_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_client_portal_tokens_token"
  ON "client_portal_tokens" ("token");

--> statement-breakpoint

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. letter_analytics
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "letter_analytics" (
  "id"                    serial          PRIMARY KEY,
  "letter_request_id"     integer         NOT NULL UNIQUE
    REFERENCES "letter_requests"("id") ON DELETE CASCADE,
  "pipeline_duration_ms"  integer,
  "stage_durations_json"  jsonb,
  "total_tokens"          integer,
  "total_cost_cents"      integer,
  "vetting_iterations"    integer         NOT NULL DEFAULT 1,
  "quality_score"         text,
  "created_at"            timestamptz     NOT NULL DEFAULT now(),
  "updated_at"            timestamptz     NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_letter_analytics_request_id"
  ON "letter_analytics" ("letter_request_id");

--> statement-breakpoint

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. blog_posts — add reviewed_by + reviewed_at columns
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE "blog_posts"
  ADD COLUMN IF NOT EXISTS "reviewed_by"  varchar(200),
  ADD COLUMN IF NOT EXISTS "reviewed_at"  timestamptz;
