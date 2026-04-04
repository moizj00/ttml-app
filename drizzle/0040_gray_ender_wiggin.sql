DROP INDEX "idx_newsletter_subscribers_email";--> statement-breakpoint
ALTER TABLE "letter_requests" ADD COLUMN "submitted_by_admin" boolean DEFAULT false NOT NULL;