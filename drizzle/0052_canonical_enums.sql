-- 0052_canonical_enums.sql
--
-- Reconciles every pgEnum defined in `drizzle/schema/constants.ts` with the
-- live database. Use when a database has drifted from the canonical schema
-- (e.g. older deploys where `ALTER TYPE … ADD VALUE` was missed) or for
-- rebuilding from scratch on a fresh Supabase project.
--
-- Strategy:
--   * `CREATE TYPE … IF NOT EXISTS` for the initial type definition.
--   * `ALTER TYPE … ADD VALUE IF NOT EXISTS` for every value, so this file is
--     idempotent and safe to re-run.
--   * Wrapped in DO $$ BEGIN … EXCEPTION WHEN duplicate_object THEN NULL END $$
--     because `ALTER TYPE … ADD VALUE` cannot run inside a transaction block,
--     and the exception swallow keeps the script flowing on Postgres versions
--     that don't fully support `IF NOT EXISTS` in this context.
--
-- Order matches `drizzle/schema/constants.ts` (lines 125-311).

-- ─── user_role ───────────────────────────────────────────────────────────
DO $$ BEGIN CREATE TYPE "public"."user_role" AS ENUM ('subscriber', 'employee', 'admin'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE "public"."user_role" ADD VALUE IF NOT EXISTS 'attorney'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── letter_status ───────────────────────────────────────────────────────
-- 24 values total, 3 legacy (assembling, vetting, generated_unlocked, upsell_dismissed)
-- kept in the enum because Postgres can't DROP VALUE.
DO $$ BEGIN CREATE TYPE "public"."letter_status" AS ENUM ('submitted', 'researching', 'drafting', 'generated_locked', 'pending_review', 'under_review', 'needs_changes', 'approved', 'rejected'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE "public"."letter_status" ADD VALUE IF NOT EXISTS 'assembling'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE "public"."letter_status" ADD VALUE IF NOT EXISTS 'vetting'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE "public"."letter_status" ADD VALUE IF NOT EXISTS 'ai_generation_completed_hidden'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE "public"."letter_status" ADD VALUE IF NOT EXISTS 'letter_released_to_subscriber'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE "public"."letter_status" ADD VALUE IF NOT EXISTS 'attorney_review_upsell_shown'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE "public"."letter_status" ADD VALUE IF NOT EXISTS 'attorney_review_checkout_started'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE "public"."letter_status" ADD VALUE IF NOT EXISTS 'attorney_review_payment_confirmed'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE "public"."letter_status" ADD VALUE IF NOT EXISTS 'generated_unlocked'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE "public"."letter_status" ADD VALUE IF NOT EXISTS 'upsell_dismissed'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE "public"."letter_status" ADD VALUE IF NOT EXISTS 'pipeline_failed'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE "public"."letter_status" ADD VALUE IF NOT EXISTS 'client_approval_pending'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE "public"."letter_status" ADD VALUE IF NOT EXISTS 'client_revision_requested'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE "public"."letter_status" ADD VALUE IF NOT EXISTS 'client_declined'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE "public"."letter_status" ADD VALUE IF NOT EXISTS 'client_approved'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE "public"."letter_status" ADD VALUE IF NOT EXISTS 'sent'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── letter_type ─────────────────────────────────────────────────────────
DO $$ BEGIN CREATE TYPE "public"."letter_type" AS ENUM ('demand-letter', 'cease-and-desist', 'contract-breach', 'eviction-notice', 'employment-dispute', 'consumer-complaint', 'general-legal'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE "public"."letter_type" ADD VALUE IF NOT EXISTS 'pre-litigation-settlement'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE "public"."letter_type" ADD VALUE IF NOT EXISTS 'debt-collection'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE "public"."letter_type" ADD VALUE IF NOT EXISTS 'estate-probate'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE "public"."letter_type" ADD VALUE IF NOT EXISTS 'landlord-tenant'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE "public"."letter_type" ADD VALUE IF NOT EXISTS 'insurance-dispute'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE "public"."letter_type" ADD VALUE IF NOT EXISTS 'personal-injury-demand'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE "public"."letter_type" ADD VALUE IF NOT EXISTS 'intellectual-property'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE "public"."letter_type" ADD VALUE IF NOT EXISTS 'family-law'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE "public"."letter_type" ADD VALUE IF NOT EXISTS 'neighbor-hoa'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── version_type ────────────────────────────────────────────────────────
DO $$ BEGIN CREATE TYPE "public"."version_type" AS ENUM ('ai_draft', 'attorney_edit', 'final_approved'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── actor_type ──────────────────────────────────────────────────────────
DO $$ BEGIN CREATE TYPE "public"."actor_type" AS ENUM ('system', 'subscriber', 'employee', 'admin'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE "public"."actor_type" ADD VALUE IF NOT EXISTS 'attorney'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── job_status ──────────────────────────────────────────────────────────
DO $$ BEGIN CREATE TYPE "public"."job_status" AS ENUM ('queued', 'running', 'completed', 'failed'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── job_type ────────────────────────────────────────────────────────────
DO $$ BEGIN CREATE TYPE "public"."job_type" AS ENUM ('research', 'draft_generation', 'generation_pipeline', 'retry'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE "public"."job_type" ADD VALUE IF NOT EXISTS 'vetting'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE "public"."job_type" ADD VALUE IF NOT EXISTS 'assembly'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── research_status ─────────────────────────────────────────────────────
DO $$ BEGIN CREATE TYPE "public"."research_status" AS ENUM ('queued', 'running', 'completed', 'failed', 'invalid'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── priority_level ──────────────────────────────────────────────────────
DO $$ BEGIN CREATE TYPE "public"."priority_level" AS ENUM ('low', 'normal', 'high', 'urgent'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── note_visibility ─────────────────────────────────────────────────────
DO $$ BEGIN CREATE TYPE "public"."note_visibility" AS ENUM ('internal', 'user_visible'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── subscription_plan ───────────────────────────────────────────────────
DO $$ BEGIN CREATE TYPE "public"."subscription_plan" AS ENUM ('per_letter', 'monthly', 'annual'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE "public"."subscription_plan" ADD VALUE IF NOT EXISTS 'monthly_basic'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE "public"."subscription_plan" ADD VALUE IF NOT EXISTS 'free_trial_review'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE "public"."subscription_plan" ADD VALUE IF NOT EXISTS 'starter'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE "public"."subscription_plan" ADD VALUE IF NOT EXISTS 'professional'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE "public"."subscription_plan" ADD VALUE IF NOT EXISTS 'single_letter'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE "public"."subscription_plan" ADD VALUE IF NOT EXISTS 'yearly'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── subscription_status ─────────────────────────────────────────────────
DO $$ BEGIN CREATE TYPE "public"."subscription_status" AS ENUM ('active', 'canceled', 'past_due', 'trialing', 'incomplete', 'none'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── commission_status ───────────────────────────────────────────────────
DO $$ BEGIN CREATE TYPE "public"."commission_status" AS ENUM ('pending', 'paid', 'voided'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── payout_status ───────────────────────────────────────────────────────
DO $$ BEGIN CREATE TYPE "public"."payout_status" AS ENUM ('pending', 'processing', 'completed', 'rejected'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── pipeline_stage ──────────────────────────────────────────────────────
DO $$ BEGIN CREATE TYPE "public"."pipeline_stage" AS ENUM ('research', 'drafting', 'assembly', 'vetting'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── lesson_category ─────────────────────────────────────────────────────
DO $$ BEGIN CREATE TYPE "public"."lesson_category" AS ENUM ('citation_error', 'jurisdiction_error', 'tone_issue', 'structure_issue', 'factual_error', 'bloat_detected', 'missing_section', 'style_preference', 'legal_accuracy', 'general'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── lesson_source ───────────────────────────────────────────────────────
DO $$ BEGIN CREATE TYPE "public"."lesson_source" AS ENUM ('attorney_approval', 'attorney_rejection', 'attorney_changes', 'attorney_edit', 'manual'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE "public"."lesson_source" ADD VALUE IF NOT EXISTS 'subscriber_update'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE "public"."lesson_source" ADD VALUE IF NOT EXISTS 'subscriber_retry'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE "public"."lesson_source" ADD VALUE IF NOT EXISTS 'consolidation'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
