-- Migration 0012: Add admin verification codes table for 2FA

CREATE TABLE IF NOT EXISTS admin_verification_codes (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL,
  code VARCHAR(8) NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_verification_codes_user_id ON admin_verification_codes(user_id);
