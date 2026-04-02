ALTER TABLE "research_runs" ADD COLUMN IF NOT EXISTS "cache_hit" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "research_runs" ADD COLUMN IF NOT EXISTS "cache_key" varchar(256);