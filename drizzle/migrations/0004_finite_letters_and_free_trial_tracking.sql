-- Migration 0004: Finite letter allowances + explicit free-trial tracking
--
-- 1. Normalize any existing -1 (unlimited) rows to their correct per-plan finite value.
-- 2. Add CHECK constraint so letters_allowed can never be written as -1 again.
-- 3. Add free_review_used_at column to users so the free-trial-used state is
--    explicit and no longer derived from letter-count queries.

-- ── Step 1: Normalise legacy -1 rows ─────────────────────────────────────────
UPDATE subscriptions
SET letters_allowed = CASE plan
  WHEN 'free_trial'         THEN 1
  WHEN 'free_trial_review'  THEN 1
  WHEN 'per_letter'         THEN 1
  WHEN 'monthly_basic'      THEN 4
  WHEN 'starter'            THEN 4
  WHEN 'monthly'            THEN 4
  WHEN 'monthly_pro'        THEN 8
  WHEN 'professional'       THEN 8
  WHEN 'annual'             THEN 8
  ELSE 1
END
WHERE letters_allowed = -1;

-- ── Step 2: Add non-negative constraint ───────────────────────────────────────
ALTER TABLE subscriptions
  ADD CONSTRAINT check_letters_allowed_non_negative
  CHECK (letters_allowed >= 0);

-- ── Step 3: Explicit free-trial tracking column ───────────────────────────────
-- NULL means the free trial has not been used.
-- Non-NULL timestamp means it was used at that point in time.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS free_review_used_at TIMESTAMPTZ;
