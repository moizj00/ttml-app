CREATE TABLE IF NOT EXISTS "pipeline_records" (
  "id" serial PRIMARY KEY NOT NULL,
  "pipeline_id" integer NOT NULL,
  "status" varchar(50) DEFAULT 'pending' NOT NULL,
  "current_step" varchar(50) DEFAULT 'pending' NOT NULL,
  "progress" integer DEFAULT 0 NOT NULL,
  "final_letter" text,
  "error_message" text,
  "payload_json" jsonb,
  "state_json" jsonb,
  "started_at" timestamp with time zone,
  "completed_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'pipeline_records_pipeline_id_letter_requests_id_fk'
  ) THEN
    ALTER TABLE "pipeline_records"
      ADD CONSTRAINT "pipeline_records_pipeline_id_letter_requests_id_fk"
      FOREIGN KEY ("pipeline_id") REFERENCES "public"."letter_requests"("id")
      ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_pipeline_records_pipeline_id"
  ON "pipeline_records" USING btree ("pipeline_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_pipeline_records_status"
  ON "pipeline_records" USING btree ("status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_pipeline_records_current_step"
  ON "pipeline_records" USING btree ("current_step");
