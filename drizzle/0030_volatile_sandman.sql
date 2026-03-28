DO $$ BEGIN ALTER TYPE "public"."lesson_source" ADD VALUE IF NOT EXISTS 'consolidation'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
ALTER TABLE "pipeline_lessons" ADD COLUMN IF NOT EXISTS "hit_count" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "pipeline_lessons" ADD COLUMN IF NOT EXISTS "times_injected" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "pipeline_lessons" ADD COLUMN IF NOT EXISTS "consolidated_from_ids" integer[];--> statement-breakpoint
ALTER TABLE "pipeline_lessons" ADD COLUMN IF NOT EXISTS "letters_before_avg_score" integer;--> statement-breakpoint
ALTER TABLE "pipeline_lessons" ADD COLUMN IF NOT EXISTS "letters_after_avg_score" integer;--> statement-breakpoint
ALTER TABLE "pipeline_lessons" ADD COLUMN IF NOT EXISTS "effectiveness_samples" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "pipeline_lessons" ADD COLUMN IF NOT EXISTS "last_injected_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_pipeline_lessons_type_jurisdiction_active" ON "pipeline_lessons" USING btree ("letter_type","jurisdiction","is_active");
