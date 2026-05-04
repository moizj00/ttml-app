CREATE TABLE IF NOT EXISTS "document_analyses" (
  "id" serial PRIMARY KEY NOT NULL,
  "document_name" varchar(500) NOT NULL,
  "file_type" varchar(20) NOT NULL,
  "analysis_json" jsonb NOT NULL,
  "user_id" integer,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "idx_document_analyses_user_id" ON "document_analyses" ("user_id");
CREATE INDEX IF NOT EXISTS "idx_document_analyses_created_at" ON "document_analyses" ("created_at");
