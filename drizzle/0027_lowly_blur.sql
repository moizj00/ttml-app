ALTER TABLE "workflow_jobs" ADD COLUMN "prompt_tokens" integer;--> statement-breakpoint
ALTER TABLE "workflow_jobs" ADD COLUMN "completion_tokens" integer;--> statement-breakpoint
ALTER TABLE "workflow_jobs" ADD COLUMN "estimated_cost_usd" numeric(10, 6);