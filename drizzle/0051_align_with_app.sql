-- Migration 0051: align live DB with app schema
--
-- Cleans up four classes of drift surfaced by the schema audit:
--
--   1. Drop orphan column `letter_requests.initial_paywall_email_sent_at`.
--      Migration 0049 intended to RENAME this to free_preview_viewed_at, but the
--      Supabase migration tracker only ran the IF-NOT-EXISTS variant (0048) which
--      added free_preview_viewed_at directly — leaving initial_paywall_email_sent_at
--      orphaned. No code in server/, client/, or shared/ references the old column.
--      (3 historical rows have non-NULL values; those timestamps are from the legacy
--      paywall-email feature that no longer exists and are not load-bearing.)
--
--   2. Drop duplicate index `idx_blog_posts_slug`. It is identical to the
--      constraint-backed `blog_posts_slug_unique` (UNIQUE btree on slug).
--
--   3. Add covering indexes for 5 unindexed foreign keys flagged by the
--      Supabase performance advisor. All five are FKs that would otherwise
--      require a sequential scan when the parent row is deleted/updated.
--
--   4. Harden the search_path on 10 application-defined PL/pgSQL/SQL
--      functions. With a mutable search_path, a malicious schema on the
--      role's search path could shadow a function or operator and execute
--      arbitrary code in the function's security context. Pinning to
--      `public, pg_catalog` closes the hole. Only public.* app functions
--      are touched here; pg-boss/pgmq functions are owned by their
--      extensions and managed upstream.
--
-- NOTE on `letter_status` enum drift (`assembling`, `vetting` in DB but not
-- in drizzle): Postgres does not support `ALTER TYPE ... DROP VALUE`, and
-- recreating the enum would require rewriting every column that uses it.
-- Per the audit, zero rows use either value. They are handled by adding
-- them to drizzle's letterStatusEnum with a `// legacy` marker (matching
-- the existing pattern for generated_unlocked / upsell_dismissed) — see
-- the companion edit to drizzle/schema/constants.ts. No DDL needed.
--
-- All statements use IF EXISTS / IF NOT EXISTS where applicable so the
-- migration is idempotent and safe to re-run.

--> statement-breakpoint
-- 1. Drop orphan column
ALTER TABLE "letter_requests" DROP COLUMN IF EXISTS "initial_paywall_email_sent_at";

--> statement-breakpoint
-- 2. Drop duplicate index (the UNIQUE constraint index `blog_posts_slug_unique` remains)
DROP INDEX IF EXISTS "idx_blog_posts_slug";

--> statement-breakpoint
-- 3. Cover unindexed foreign keys
CREATE INDEX IF NOT EXISTS "idx_commission_ledger_letter_request_id"
  ON "commission_ledger" ("letter_request_id");

--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_commission_ledger_subscriber_id"
  ON "commission_ledger" ("subscriber_id");

--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_letter_requests_template_id"
  ON "letter_requests" ("template_id");

--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_payout_requests_processed_by"
  ON "payout_requests" ("processed_by");

--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_pipeline_lessons_created_by_user_id"
  ON "pipeline_lessons" ("created_by_user_id");

--> statement-breakpoint
-- 4. Pin search_path on app functions (closes function_search_path_mutable advisor warnings)
ALTER FUNCTION public.app_user_id() SET search_path = public, pg_catalog;
ALTER FUNCTION public.app_user_role() SET search_path = public, pg_catalog;
ALTER FUNCTION public.is_app_admin() SET search_path = public, pg_catalog;
ALTER FUNCTION public.is_app_employee_or_admin() SET search_path = public, pg_catalog;
ALTER FUNCTION public.is_app_subscriber() SET search_path = public, pg_catalog;
ALTER FUNCTION public.update_updated_at_column() SET search_path = public, pg_catalog;
-- cleanup_old_stream_chunks is a PROCEDURE (prokind = 'p'), not a function
ALTER PROCEDURE public.cleanup_old_stream_chunks() SET search_path = public, pg_catalog;
ALTER FUNCTION public.count_training_examples_since_last_tune() SET search_path = public, pg_catalog;

--> statement-breakpoint
-- match_letters has two overloads — pin both
ALTER FUNCTION public.match_letters(vector, double precision, integer)
  SET search_path = public, pg_catalog;
ALTER FUNCTION public.match_letters(vector, double precision, integer, text, text)
  SET search_path = public, pg_catalog;

--> statement-breakpoint
ALTER FUNCTION public.match_letters_v2(vector, double precision, integer)
  SET search_path = public, pg_catalog;
