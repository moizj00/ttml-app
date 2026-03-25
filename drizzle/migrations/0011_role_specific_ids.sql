-- Migration 0011: Add role-specific human-readable IDs and letter tracking

-- 1. Add role-specific human-readable IDs to users table
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS subscriber_id VARCHAR(16) UNIQUE,
  ADD COLUMN IF NOT EXISTS employee_id VARCHAR(16) UNIQUE,
  ADD COLUMN IF NOT EXISTS attorney_id VARCHAR(16) UNIQUE;

-- Backfill subscriber IDs (safe for re-run: starts from current max + 1)
WITH max_existing AS (
  SELECT COALESCE(MAX(CAST(SPLIT_PART(subscriber_id, '-', 2) AS INTEGER)), 0) AS max_num
  FROM users WHERE subscriber_id LIKE 'SUB-%'
),
ranked AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY created_at ASC) + me.max_num AS rn
  FROM users, max_existing me
  WHERE role = 'subscriber' AND subscriber_id IS NULL
)
UPDATE users
SET subscriber_id = 'SUB-' || LPAD(ranked.rn::text, 4, '0')
FROM ranked
WHERE users.id = ranked.id;

-- Backfill employee IDs (safe for re-run)
WITH max_existing AS (
  SELECT COALESCE(MAX(CAST(SPLIT_PART(employee_id, '-', 2) AS INTEGER)), 0) AS max_num
  FROM users WHERE employee_id LIKE 'EMP-%'
),
ranked AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY created_at ASC) + me.max_num AS rn
  FROM users, max_existing me
  WHERE role = 'employee' AND employee_id IS NULL
)
UPDATE users
SET employee_id = 'EMP-' || LPAD(ranked.rn::text, 4, '0')
FROM ranked
WHERE users.id = ranked.id;

-- Backfill attorney IDs (safe for re-run)
WITH max_existing AS (
  SELECT COALESCE(MAX(CAST(SPLIT_PART(attorney_id, '-', 2) AS INTEGER)), 0) AS max_num
  FROM users WHERE attorney_id LIKE 'ATT-%'
),
ranked AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY created_at ASC) + me.max_num AS rn
  FROM users, max_existing me
  WHERE role = 'attorney' AND attorney_id IS NULL
)
UPDATE users
SET attorney_id = 'ATT-' || LPAD(ranked.rn::text, 4, '0')
FROM ranked
WHERE users.id = ranked.id;

-- 2. Add submitter and reviewer role IDs to letter_requests for tracking
ALTER TABLE letter_requests
  ADD COLUMN IF NOT EXISTS submitter_role_id VARCHAR(16),
  ADD COLUMN IF NOT EXISTS reviewer_role_id VARCHAR(16);

-- Backfill submitter_role_id for existing letters
UPDATE letter_requests lr
SET submitter_role_id = u.subscriber_id
FROM users u
WHERE lr.user_id = u.id AND u.subscriber_id IS NOT NULL AND lr.submitter_role_id IS NULL;

-- Backfill reviewer_role_id for existing letters that have an assigned reviewer
UPDATE letter_requests lr
SET reviewer_role_id = u.attorney_id
FROM users u
WHERE lr.assigned_reviewer_id = u.id AND u.attorney_id IS NOT NULL AND lr.reviewer_role_id IS NULL;
