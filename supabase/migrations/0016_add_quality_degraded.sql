-- Migration: add quality_degraded boolean to letter_requests
-- This flag is set when the pipeline delivers a draft via best-effort fallback
-- or when vetting/jurisdiction checks raise quality warnings that prevent a
-- clean pass. Attorneys see an extra-scrutiny banner; admins are notified.
ALTER TABLE letter_requests
  ADD COLUMN IF NOT EXISTS quality_degraded boolean NOT NULL DEFAULT false;
