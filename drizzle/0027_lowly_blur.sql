ALTER TABLE "workflow_jobs" ADD COLUMN IF NOT EXISTS "prompt_tokens" integer;--> statement-breakpoint
ALTER TABLE "workflow_jobs" ADD COLUMN IF NOT EXISTS "completion_tokens" integer;--> statement-breakpoint
ALTER TABLE "workflow_jobs" ADD COLUMN IF NOT EXISTS "estimated_cost_usd" numeric(10, 6);