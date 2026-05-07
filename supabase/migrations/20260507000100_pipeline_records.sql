-- Durable progress rows for the LangGraph multi-agent background pipeline.

CREATE TABLE IF NOT EXISTS pipeline_records (
  id             serial PRIMARY KEY,
  pipeline_id    integer NOT NULL REFERENCES letter_requests(id) ON DELETE CASCADE,
  status         varchar(50) NOT NULL DEFAULT 'pending',
  current_step   varchar(50) NOT NULL DEFAULT 'pending',
  progress       integer NOT NULL DEFAULT 0,
  final_letter   text,
  error_message  text,
  payload_json   jsonb,
  state_json     jsonb,
  started_at     timestamptz,
  completed_at   timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_pipeline_records_pipeline_id
  ON pipeline_records (pipeline_id);

CREATE INDEX IF NOT EXISTS idx_pipeline_records_status
  ON pipeline_records (status);

CREATE INDEX IF NOT EXISTS idx_pipeline_records_current_step
  ON pipeline_records (current_step);

ALTER TABLE pipeline_records ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_view_own_pipeline_records" ON pipeline_records;

CREATE POLICY "users_view_own_pipeline_records"
  ON pipeline_records
  FOR SELECT
  USING (
    pipeline_id IN (
      SELECT lr.id
      FROM letter_requests lr
      JOIN users u ON u.id = lr.user_id
      WHERE u.open_id = auth.uid()::text
    )
  );

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'pipeline_records'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE pipeline_records;
  END IF;
END $$;
