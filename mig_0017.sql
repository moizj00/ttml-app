-- Migration: 0017_initial_paywall_email_sent_at
-- Adds initial_paywall_email_sent_at column to letter_requests table.
-- This column tracks when the first timed paywall notification email was sent
-- to the subscriber (10-15 minutes after the letter reaches generated_locked status).
-- NULL means the email has not been sent yet.
-- Idempotency: the cron job only sends the email once per letter.

ALTER TABLE "letter_requests" ADD COLUMN IF NOT EXISTS "initial_paywall_email_sent_at" timestamp with time zone;
