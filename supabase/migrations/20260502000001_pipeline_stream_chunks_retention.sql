-- ═══════════════════════════
-- Migration: pipeline_stream_chunks retention → 1h
--
-- Tightens TTL on pipeline_stream_chunks from 24h to 1h. The chunks
-- are purely an ephemeral transport for the LangGraph draft node →
-- frontend SSE relay; once the draft is finalized into letter_versions
-- the chunks are no longer useful and just bloat the realtime
-- publication backlog.
--
-- The 24h cleanup procedure from migration 20260414000001 is replaced
-- with a 1h cleanup. The procedure name is preserved so any existing
-- pg_cron schedule keeps firing without needing to be re-registered.
-- ═══════════════════════════

-- Index to make the TTL cleanup DELETE efficient (sequential scan otherwise)
CREATE INDEX IF NOT EXISTS idx_pipeline_stream_chunks_created_at
  ON pipeline_stream_chunks(created_at);

CREATE OR REPLACE PROCEDURE cleanup_old_stream_chunks()
LANGUAGE plpgsql AS $$
BEGIN
  DELETE FROM pipeline_stream_chunks
  WHERE created_at < now() - interval '1 hour';
END;
$$;

-- Best-effort scheduled cleanup: register a pg_cron job to run every
-- 10 minutes if pg_cron is installed. Safe to rerun — cron.schedule()
-- replaces an existing schedule with the same name.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_extension
    WHERE extname = 'pg_cron'
  ) THEN
    PERFORM cron.schedule(
      'cleanup_pipeline_stream_chunks',
      '*/10 * * * *',
      $$CALL cleanup_old_stream_chunks()$$
    );
  END IF;
END
$$;
