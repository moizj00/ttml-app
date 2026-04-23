ALTER TABLE "letter_requests" RENAME COLUMN "initial_paywall_email_sent_at" TO "free_preview_viewed_at";--> statement-breakpoint
ALTER TABLE "attachments" ALTER COLUMN "uploaded_by_user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "letter_requests" ADD COLUMN "approved_by_role" varchar(50);--> statement-breakpoint
ALTER TABLE "letter_requests" ADD COLUMN "is_free_preview" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "letter_requests" ADD COLUMN "free_preview_unlock_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "letter_requests" ADD COLUMN "free_preview_email_sent_at" timestamp with time zone;