ALTER TABLE "research_runs" ADD COLUMN "cache_hit" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "research_runs" ADD COLUMN "cache_key" varchar(256);