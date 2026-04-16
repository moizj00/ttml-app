-- Migration 0046: new_tables_and_blog_review
-- Adds: client_portal_tokens, letter_analytics, letter_delivery_log
-- Uses CREATE TABLE IF NOT EXISTS — safe to apply even if tables already exist in DB.

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "client_portal_tokens" (
  "id" serial PRIMARY KEY NOT NULL,
  "letter_request_id" integer NOT NULL REFERENCES "letter_requests"("id") ON DELETE CASCADE,
  "token" varchar(64) NOT NULL UNIQUE,
  "recipient_email" varchar(320),
  "recipient_name" varchar(500),
  "expires_at" timestamp with time zone NOT NULL,
  "viewed_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_client_portal_tokens_letter_request_id" ON "client_portal_tokens" USING btree ("letter_request_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_client_portal_tokens_token" ON "client_portal_tokens" USING btree ("token");

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "letter_analytics" (
  "id" serial PRIMARY KEY NOT NULL,
  "letter_request_id" integer NOT NULL UNIQUE REFERENCES "letter_requests"("id") ON DELETE CASCADE,
  "pipeline_duration_ms" integer,
  "stage_durations_json" jsonb,
  "total_tokens" integer,
  "total_cost_cents" integer,
  "vetting_iterations" integer DEFAULT 1 NOT NULL,
  "quality_score" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_letter_analytics_request_id" ON "letter_analytics" USING btree ("letter_request_id");

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "letter_delivery_log" (
  "id" serial PRIMARY KEY NOT NULL,
  "letter_request_id" integer NOT NULL REFERENCES "letter_requests"("id") ON DELETE CASCADE,
  "recipient_email" varchar(320),
  "recipient_name" varchar(500),
  "delivery_method" varchar(50) DEFAULT 'email' NOT NULL,
  "delivery_status" varchar(50) DEFAULT 'pending' NOT NULL,
  "resend_message_id" varchar(255),
  "delivered_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_letter_delivery_log_request_id" ON "letter_delivery_log" USING btree ("letter_request_id");
