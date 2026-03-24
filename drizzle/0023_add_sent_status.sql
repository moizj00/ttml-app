ALTER TYPE "public"."letter_status" ADD VALUE IF NOT EXISTS 'pipeline_failed';--> statement-breakpoint
ALTER TYPE "public"."letter_status" ADD VALUE IF NOT EXISTS 'sent';
