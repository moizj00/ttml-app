ALTER TYPE "public"."letter_status" ADD VALUE 'upsell_dismissed' BEFORE 'pending_review';--> statement-breakpoint
DROP INDEX "idx_letter_requests_status";--> statement-breakpoint
DROP INDEX "idx_letter_requests_user_id";--> statement-breakpoint
DROP INDEX "idx_letter_requests_assigned_reviewer";--> statement-breakpoint
DROP INDEX "idx_letter_versions_letter_request_id";--> statement-breakpoint
DROP INDEX "idx_research_runs_letter_request_status";--> statement-breakpoint
DROP INDEX "idx_review_actions_letter_request_id";--> statement-breakpoint
DROP INDEX "idx_workflow_jobs_letter_request_status";--> statement-breakpoint
ALTER TABLE "letter_requests" ADD COLUMN "pdf_storage_path" varchar(1000);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "free_review_used_at" timestamp with time zone;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_commission_ledger_stripe_pi" ON "commission_ledger" USING btree ("stripe_payment_intent_id");