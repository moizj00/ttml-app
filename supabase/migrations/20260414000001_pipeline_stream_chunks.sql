-- ═══════════════════════════
-- Migration: pipeline_stream_chunks
-- Stores real-time token chunks streamed by the LangGraph
-- draft node so the frontend can subscribe via Supabase
-- Realtime and show letter generation in progress.
-- ═══════════════════════════

CREATE TABLE IF NOT EXISTS pipeline_stream_chunks (
  id             bigserial PRIMARY KEY,
  letter_id      integer   NOT NULL REFERENCES letter_requests(id) ON DELETE CASCADE,
  chunk_text     text      NOT NULL,
  stage          varchar(50) NOT NULL DEFAULT 'draft',
  sequence_number integer  NOT NULL DEFAULT 0,
  created_at     timestamptz NOT NULL DEFAULT now()
);

-- Index for efficient polling / realtime queries per letter
CREATE INDEX idx_pipeline_stream_chunks_letter_id
  ON pipeline_stream_chunks (letter_id);

CREATE INDEX idx_pipeline_stream_chunks_letter_sequence
  ON pipeline_stream_chunks (letter_id, sequence_number);

-- ─── Enable Row Level Security ───────────────

ALTER TABLE pipeline_stream_chunks ENABLE ROW LEVEL SECURITY;

-- Users can only see chunks for their own letters
-- (auth.uid() maps to the user's Supabase auth id;
--  we join through letter_requests → users to get the
--  Supabase auth id stored in users.open_id)
CREATE POLICY "users_view_own_letter_chunks"
  ON pipeline_stream_chunks
  FOR SELECT
  USING (
    letter_id IN (
      SELECT lr.id
      FROM letter_requests lr
      JOIN users u ON u.id = lr.user_id
      WHERE u.open_id = auth.uid()
    )
  );

-- Service role (server) can insert chunks (bypasses RLS)
-- No INSERT policy needed — service role key bypasses RLS by default.

-- ─── Realtime publication ────────────────

-- Add the table to the Supabase realtime publication so
-- the React hook's postgres_changes subscription fires.
ALTER PUBLICATION supabase_realtime ADD TABLE pipeline_stream_chunks;

-- ─── TTL cleanup function ────────────────

-- Chunks older than 24h are ephemeral; optionally prune them.
-- Call via a pg_cron job: SELECT cron.schedule('0 3 * * *', $$CALL cleanup_old_stream_chunks()$$);

CREATE OR REPLACE PROCEDURE cleanup_old_stream_chunks()
LANGUAGE plpgsql AS $$
BEGIN
  DELETE FROM pipeline_stream_chunks
  WHERE created_at < now() - interval '24 hours';
END;
$$;
