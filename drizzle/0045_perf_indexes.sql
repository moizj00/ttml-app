CREATE INDEX "idx_letter_versions_request_type" ON "letter_versions" USING btree ("letter_request_id","version_type");--> statement-breakpoint
CREATE INDEX "idx_research_runs_status" ON "research_runs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_research_runs_cache_hit" ON "research_runs" USING btree ("cache_hit");--> statement-breakpoint
CREATE INDEX "idx_review_actions_action_created" ON "review_actions" USING btree ("action","created_at");--> statement-breakpoint
CREATE INDEX "idx_users_role" ON "users" USING btree ("role");--> statement-breakpoint
CREATE INDEX "idx_users_role_active" ON "users" USING btree ("role","is_active");--> statement-breakpoint
CREATE INDEX "idx_workflow_jobs_status_created" ON "workflow_jobs" USING btree ("status","created_at");