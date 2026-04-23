ALTER TYPE "public"."letter_status" ADD VALUE 'ai_generation_completed_hidden' BEFORE 'generated_locked';--> statement-breakpoint
ALTER TYPE "public"."letter_status" ADD VALUE 'letter_released_to_subscriber' BEFORE 'generated_locked';--> statement-breakpoint
ALTER TYPE "public"."letter_status" ADD VALUE 'attorney_review_upsell_shown' BEFORE 'generated_locked';