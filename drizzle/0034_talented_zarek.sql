CREATE TABLE "fine_tune_runs" (
        "id" serial PRIMARY KEY NOT NULL,
        "vertex_job_id" varchar(500),
        "base_model" varchar(200) NOT NULL,
        "training_example_count" integer NOT NULL,
        "status" varchar(50) DEFAULT 'submitted' NOT NULL,
        "gcs_training_file" varchar(1000),
        "result_model_id" varchar(500),
        "error_message" text,
        "started_at" timestamp with time zone DEFAULT now() NOT NULL,
        "completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "training_log" (
        "id" serial PRIMARY KEY NOT NULL,
        "letter_request_id" integer NOT NULL,
        "letter_type" varchar(50) NOT NULL,
        "jurisdiction" varchar(100),
        "gcs_path" varchar(1000),
        "token_count" integer,
        "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "letter_versions" ADD COLUMN IF NOT EXISTS "embedding" vector(1536);--> statement-breakpoint
CREATE INDEX "idx_fine_tune_runs_status" ON "fine_tune_runs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_fine_tune_runs_started_at" ON "fine_tune_runs" USING btree ("started_at");--> statement-breakpoint
CREATE INDEX "idx_training_log_letter_request_id" ON "training_log" USING btree ("letter_request_id");--> statement-breakpoint
CREATE INDEX "idx_training_log_created_at" ON "training_log" USING btree ("created_at");