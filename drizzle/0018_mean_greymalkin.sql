CREATE TABLE "document_analyses" (
	"id" serial PRIMARY KEY NOT NULL,
	"document_name" varchar(500) NOT NULL,
	"file_type" varchar(20) NOT NULL,
	"analysis_json" jsonb NOT NULL,
	"user_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "idx_document_analyses_user_id" ON "document_analyses" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_document_analyses_created_at" ON "document_analyses" USING btree ("created_at");