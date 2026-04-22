-- ═══════════════════════════════════════════════════════════════════════════════
-- Migration 0020: RLS Insert Policy Hardening (Supabase Security Advisor fixes)
-- Talk-to-My-Lawyer — Supabase PostgreSQL
--
-- Problem:
--   Four tables had P0 "WITH CHECK (true)" INSERT policies that effectively
--   allowed any client (anon or authenticated) to insert arbitrary rows,
--   bypassing business invariants:
--
--     1. commission_ledger        — affiliate/employee commissions (money)
--     2. email_verification_tokens — auth tokens (account takeover risk)
--     3. newsletter_subscribers   — mailing list (spam/abuse risk)
--     4. users                    — account creation (privilege escalation)
--
-- Resolution (per product owner):
--   - commission_ledger      → service_role / admin only (backend-only inserts
--                              after successful Stripe checkout + affiliate code)
--   - email_verification_tokens → service_role only (only auth flows issue tokens)
--   - users                  → service_role only (only backend creates users
--                              via Supabase Auth → local users sync)
--   - newsletter_subscribers → anon + authenticated allowed (public signup form)
--
-- Backend context:
--   Our Drizzle connection (server/db/core.ts) uses postgres-js with the
--   Supabase DB-owner role, which bypasses RLS. These policies apply to
--   clients hitting Supabase REST/PostgREST directly (anon/authenticated key)
--   or the Supabase Dashboard Data tab. They are defense-in-depth.
--
-- Mirrors the policies applied ad-hoc via Supabase SQL editor on 2026-04-22.
-- Idempotent (DROP POLICY IF EXISTS ... CREATE POLICY ...).
-- ═══════════════════════════════════════════════════════════════════════════════

-- ─── Ensure RLS is enabled on all four tables ────────────────────────────────

ALTER TABLE public.commission_ledger         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_verification_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.newsletter_subscribers    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users                     ENABLE ROW LEVEL SECURITY;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 1. commission_ledger — service_role / admin only
-- ═══════════════════════════════════════════════════════════════════════════════
-- Rows are created automatically by the Stripe webhook handler
-- (server/stripeWebhook/handlers/checkout.ts → trackCommission() →
--  server/db/affiliates.ts → createCommission()) when a subscriber
-- successfully pays with an affiliate-tied discount code.
-- No client should ever write to this table directly.

DROP POLICY IF EXISTS commission_ledger_insert            ON public.commission_ledger;
DROP POLICY IF EXISTS commission_ledger_insert_system     ON public.commission_ledger;
DROP POLICY IF EXISTS commission_ledger_service_insert    ON public.commission_ledger;

CREATE POLICY commission_ledger_service_insert
  ON public.commission_ledger
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_app_admin()
    OR (current_setting('role'::text, true) = 'service_role'::text)
  );

-- ═══════════════════════════════════════════════════════════════════════════════
-- 2. email_verification_tokens — service_role only
-- ═══════════════════════════════════════════════════════════════════════════════
-- Rows are issued by the backend during signup / email-change / resend flows
-- (server/supabaseAuth/routes/verification.ts, signup-login.ts,
--  server/routers/profile.ts).
-- Clients must never mint their own verification tokens.

DROP POLICY IF EXISTS email_verification_tokens_insert         ON public.email_verification_tokens;
DROP POLICY IF EXISTS email_verification_tokens_insert_system  ON public.email_verification_tokens;
DROP POLICY IF EXISTS email_verification_tokens_service_insert ON public.email_verification_tokens;
DROP POLICY IF EXISTS evt_insert                               ON public.email_verification_tokens;
DROP POLICY IF EXISTS evt_service_role_insert                  ON public.email_verification_tokens;

CREATE POLICY evt_service_role_insert
  ON public.email_verification_tokens
  FOR INSERT
  TO authenticated
  WITH CHECK (
    is_app_admin()
    OR (current_setting('role'::text, true) = 'service_role'::text)
  );

-- ═══════════════════════════════════════════════════════════════════════════════
-- 3. users — service_role only
-- ═══════════════════════════════════════════════════════════════════════════════
-- The public.users table is populated by backend upsertUser() calls during
-- Supabase Auth → local sync (server/db/users.ts, server/supabaseAuth/*).
-- Clients must never insert their own user rows — role defaults, freeReviewUsedAt,
-- and the super-admin whitelist depend on backend-only creation.
-- Replaces the old permissive "users_insert_system WITH CHECK (true)" policy.

DROP POLICY IF EXISTS users_insert                ON public.users;
DROP POLICY IF EXISTS users_insert_system         ON public.users;
DROP POLICY IF EXISTS users_service_insert        ON public.users;
DROP POLICY IF EXISTS users_service_role_insert   ON public.users;

CREATE POLICY users_service_role_insert
  ON public.users
  FOR INSERT
  TO authenticated
  WITH CHECK (
    is_app_admin()
    OR (current_setting('role'::text, true) = 'service_role'::text)
  );

-- ═══════════════════════════════════════════════════════════════════════════════
-- 4. newsletter_subscribers — anon + authenticated allowed
-- ═══════════════════════════════════════════════════════════════════════════════
-- The footer newsletter signup form is publicly accessible (no auth).
-- Backend endpoint: POST /api/newsletter/subscribe (server/newsletterRoute.ts).
-- Anonymous visitors AND authenticated users may add themselves. Rate-limiting
-- and email validation happen at the app layer (and should be tightened — see
-- audit notes in TODO).

DROP POLICY IF EXISTS newsletter_subscribers_insert        ON public.newsletter_subscribers;
DROP POLICY IF EXISTS newsletter_subscribers_insert_system ON public.newsletter_subscribers;
DROP POLICY IF EXISTS newsletter_subscribers_public_insert ON public.newsletter_subscribers;

CREATE POLICY newsletter_subscribers_public_insert
  ON public.newsletter_subscribers
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

-- ═══════════════════════════════════════════════════════════════════════════════
-- Verification
-- ═══════════════════════════════════════════════════════════════════════════════
-- Run after apply:
--   SELECT schemaname, tablename, policyname, cmd, roles, with_check
--   FROM pg_policies
--   WHERE schemaname = 'public'
--     AND tablename IN ('commission_ledger','email_verification_tokens',
--                       'newsletter_subscribers','users')
--     AND cmd = 'INSERT'
--   ORDER BY tablename, policyname;
