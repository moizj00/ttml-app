CREATE TYPE "public"."lesson_category" AS ENUM('citation_error', 'jurisdiction_error', 'tone_issue', 'structure_issue', 'factual_error', 'bloat_detected', 'missing_section', 'style_preference', 'legal_accuracy', 'general');--> statement-breakpoint
CREATE TYPE "public"."lesson_source" AS ENUM('attorney_approval', 'attorney_rejection', 'attorney_changes', 'attorney_edit', 'manual');--> statement-breakpoint
CREATE TYPE "public"."pipeline_stage" AS ENUM('research', 'drafting', 'assembly', 'vetting');--> statement-breakpoint
CREATE TABLE "letter_quality_scores" (
	"id" serial PRIMARY KEY NOT NULL,
	"letter_request_id" integer NOT NULL,
	"first_pass_approved" boolean NOT NULL,
	"revision_count" integer DEFAULT 0 NOT NULL,
	"vetting_pass_count" integer DEFAULT 0 NOT NULL,
	"vetting_fail_count" integer DEFAULT 0 NOT NULL,
	"attorney_edit_distance" integer,
	"time_to_first_review_ms" bigint,
	"time_to_approval_ms" bigint,
	"computed_score" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pipeline_lessons" (
	"id" serial PRIMARY KEY NOT NULL,
	"letter_type" "letter_type",
	"jurisdiction" varchar(100),
	"pipeline_stage" "pipeline_stage",
	"category" "lesson_category" DEFAULT 'general' NOT NULL,
	"lesson_text" text NOT NULL,
	"source_letter_request_id" integer,
	"source_action" "lesson_source" NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"weight" integer DEFAULT 50 NOT NULL,
	"created_by_user_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "uq_quality_scores_letter_request" ON "letter_quality_scores" USING btree ("letter_request_id");--> statement-breakpoint
CREATE INDEX "idx_pipeline_lessons_active" ON "pipeline_lessons" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "idx_pipeline_lessons_letter_type" ON "pipeline_lessons" USING btree ("letter_type");--> statement-breakpoint
CREATE INDEX "idx_pipeline_lessons_jurisdiction" ON "pipeline_lessons" USING btree ("jurisdiction");--> statement-breakpoint
CREATE INDEX "idx_pipeline_lessons_stage" ON "pipeline_lessons" USING btree ("pipeline_stage");