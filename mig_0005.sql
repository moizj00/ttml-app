ALTER TABLE letter_requests ADD COLUMN IF NOT EXISTS research_unverified BOOLEAN NOT NULL DEFAULT false;
