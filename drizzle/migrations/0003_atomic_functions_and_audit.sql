-- ═══════════════════════════════════════════════════════════════════════════════
-- Migration 0003: Atomic Database Functions + Audit Trigger
-- Talk-to-My-Lawyer — Supabase PostgreSQL
--
-- Adapted from ttml-database-rls-security skill patterns.
-- Our schema uses INTEGER serial IDs (not UUIDs) and specific enum types.
-- ═══════════════════════════════════════════════════════════════════════════════

-- ─── Function: check_and_deduct_allowance ────────────────────────────────────
-- Race-safe subscription deduction with row-level locking.
-- Called from billing.payToUnlock and billing.freeUnlock procedures.

CREATE OR REPLACE FUNCTION public.check_and_deduct_allowance(
  p_user_id INTEGER,
  p_amount INTEGER DEFAULT 1
)
RETURNS TABLE(
  success BOOLEAN,
  remaining INTEGER,
  error_message TEXT
) AS $func$
DECLARE
  v_subscription_id INTEGER;
  v_letters_allowed INTEGER;
  v_letters_used INTEGER;
BEGIN
  -- Lock subscription row for update (prevents race conditions)
  SELECT id, letters_allowed, letters_used
  INTO v_subscription_id, v_letters_allowed, v_letters_used
  FROM subscriptions
  WHERE user_id = p_user_id
    AND status = 'active'
  ORDER BY created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF v_subscription_id IS NULL THEN
    RETURN QUERY SELECT FALSE, 0, 'No active subscription found'::TEXT;
    RETURN;
  END IF;

  -- Check if unlimited (-1 = unlimited for monthly/annual plans)
  IF v_letters_allowed = -1 THEN
    -- Increment usage counter but always allow
    UPDATE subscriptions
    SET letters_used = letters_used + p_amount, updated_at = NOW()
    WHERE id = v_subscription_id;
    RETURN QUERY SELECT TRUE, -1, NULL::TEXT;
    RETURN;
  END IF;

  -- Check sufficient allowance
  IF (v_letters_allowed - v_letters_used) >= p_amount THEN
    UPDATE subscriptions
    SET letters_used = letters_used + p_amount, updated_at = NOW()
    WHERE id = v_subscription_id;
    RETURN QUERY SELECT TRUE, (v_letters_allowed - v_letters_used - p_amount), NULL::TEXT;
  ELSE
    RETURN QUERY SELECT FALSE, (v_letters_allowed - v_letters_used), 'Insufficient letter allowance'::TEXT;
  END IF;
END;
$func$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;


-- ─── Function: refund_letter_allowance ───────────────────────────────────────
-- Atomic refund on pipeline failure. Decrements letters_used.

CREATE OR REPLACE FUNCTION public.refund_letter_allowance(
  p_user_id INTEGER,
  p_letter_id INTEGER,
  p_amount INTEGER DEFAULT 1
)
RETURNS TABLE(
  success BOOLEAN,
  new_remaining INTEGER,
  error_message TEXT
) AS $func$
DECLARE
  v_subscription_id INTEGER;
  v_letters_allowed INTEGER;
  v_letters_used INTEGER;
BEGIN
  SELECT id, letters_allowed, letters_used
  INTO v_subscription_id, v_letters_allowed, v_letters_used
  FROM subscriptions
  WHERE user_id = p_user_id
    AND status = 'active'
  ORDER BY created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF v_subscription_id IS NULL THEN
    RETURN QUERY SELECT FALSE, 0, 'No active subscription found'::TEXT;
    RETURN;
  END IF;

  -- Decrement usage (but never below 0)
  UPDATE subscriptions
  SET
    letters_used = GREATEST(letters_used - p_amount, 0),
    updated_at = NOW()
  WHERE id = v_subscription_id;

  -- Return new remaining
  IF v_letters_allowed = -1 THEN
    RETURN QUERY SELECT TRUE, -1, NULL::TEXT;
  ELSE
    RETURN QUERY SELECT TRUE, (v_letters_allowed - GREATEST(v_letters_used - p_amount, 0)), NULL::TEXT;
  END IF;
END;
$func$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;


-- ─── Function: safe_status_transition ────────────────────────────────────────
-- Validates the status machine at the database level.
-- Prevents invalid transitions even if the application layer has a bug.

CREATE OR REPLACE FUNCTION public.safe_status_transition(
  p_letter_id INTEGER,
  p_new_status letter_status,
  p_actor_id INTEGER DEFAULT NULL,
  p_actor_type actor_type DEFAULT 'system'
)
RETURNS TABLE(
  success BOOLEAN,
  old_status TEXT,
  error_message TEXT
) AS $func$
DECLARE
  v_current_status letter_status;
  v_allowed TEXT[];
BEGIN
  -- Lock the letter row
  SELECT status INTO v_current_status
  FROM letter_requests
  WHERE id = p_letter_id
  FOR UPDATE;

  IF v_current_status IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::TEXT, 'Letter not found'::TEXT;
    RETURN;
  END IF;

  -- Define allowed transitions (mirrors the TypeScript ALLOWED_TRANSITIONS)
  v_allowed := CASE v_current_status::TEXT
    WHEN 'submitted' THEN ARRAY['researching']
    WHEN 'researching' THEN ARRAY['drafting']
    WHEN 'drafting' THEN ARRAY['generated_locked']
    WHEN 'generated_locked' THEN ARRAY['pending_review']
    WHEN 'pending_review' THEN ARRAY['under_review']
    WHEN 'under_review' THEN ARRAY['approved', 'rejected', 'needs_changes']
    WHEN 'needs_changes' THEN ARRAY['researching', 'drafting']
    ELSE ARRAY[]::TEXT[]
  END;

  -- Check if transition is allowed
  IF NOT (p_new_status::TEXT = ANY(v_allowed)) THEN
    RETURN QUERY SELECT FALSE, v_current_status::TEXT,
      format('Invalid transition: %s -> %s (allowed: %s)', v_current_status, p_new_status, array_to_string(v_allowed, ', '))::TEXT;
    RETURN;
  END IF;

  -- Perform the transition
  UPDATE letter_requests
  SET status = p_new_status, updated_at = NOW()
  WHERE id = p_letter_id;

  -- Log in review_actions audit trail
  INSERT INTO review_actions (
    letter_request_id, actor_user_id, actor_type, action,
    from_status, to_status, note_text, note_visibility
  ) VALUES (
    p_letter_id, p_actor_id, p_actor_type, 'status_transition',
    v_current_status::TEXT, p_new_status::TEXT,
    format('Status changed from %s to %s', v_current_status, p_new_status),
    'internal'
  );

  RETURN QUERY SELECT TRUE, v_current_status::TEXT, NULL::TEXT;
END;
$func$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;


-- ─── Audit Log Table ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.audit_log (
  id SERIAL PRIMARY KEY,
  table_name TEXT NOT NULL,
  operation TEXT NOT NULL,
  record_id INTEGER NOT NULL,
  old_values JSONB,
  new_values JSONB,
  changed_fields TEXT[],
  actor_user_id INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_audit_log_table_record ON audit_log (table_name, record_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_created ON audit_log (created_at DESC);


-- ─── Audit Trigger Function ─────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.log_audit_event()
RETURNS TRIGGER AS $func$
BEGIN
  INSERT INTO public.audit_log(
    table_name,
    operation,
    record_id,
    old_values,
    new_values,
    changed_fields,
    actor_user_id
  ) VALUES (
    TG_TABLE_NAME,
    TG_OP,
    COALESCE(NEW.id, OLD.id),
    CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN to_jsonb(OLD) ELSE NULL END,
    CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN to_jsonb(NEW) ELSE NULL END,
    CASE WHEN TG_OP = 'UPDATE' THEN
      ARRAY(
        SELECT key FROM jsonb_each(to_jsonb(NEW))
        WHERE to_jsonb(NEW) -> key IS DISTINCT FROM to_jsonb(OLD) -> key
      )
    ELSE NULL END,
    public.app_user_id()
  );
  RETURN NEW;
END;
$func$ LANGUAGE plpgsql SECURITY DEFINER;


-- ─── Apply Audit Triggers to Sensitive Tables ────────────────────────────────

-- Letter status changes (most critical)
DROP TRIGGER IF EXISTS letter_requests_audit ON letter_requests;
CREATE TRIGGER letter_requests_audit
  AFTER UPDATE ON letter_requests
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION public.log_audit_event();

-- Subscription changes (billing-critical)
DROP TRIGGER IF EXISTS subscriptions_audit ON subscriptions;
CREATE TRIGGER subscriptions_audit
  AFTER INSERT OR UPDATE OR DELETE ON subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.log_audit_event();

-- User role changes (security-critical)
DROP TRIGGER IF EXISTS users_role_audit ON users;
CREATE TRIGGER users_role_audit
  AFTER UPDATE ON users
  FOR EACH ROW
  WHEN (OLD.role IS DISTINCT FROM NEW.role)
  EXECUTE FUNCTION public.log_audit_event();


-- ─── Enable RLS on audit_log ─────────────────────────────────────────────────

ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

-- Only admins can read audit logs
CREATE POLICY audit_log_select_admin ON audit_log
  FOR SELECT USING (public.is_app_admin());

-- System can insert (triggers run as SECURITY DEFINER)
CREATE POLICY audit_log_insert ON audit_log
  FOR INSERT WITH CHECK (true);
