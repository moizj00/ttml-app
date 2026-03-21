CREATE INDEX "idx_attachments_letter_request_id" ON "attachments" USING btree ("letter_request_id");--> statement-breakpoint
CREATE INDEX "idx_letter_requests_user_id" ON "letter_requests" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_letter_requests_status" ON "letter_requests" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_letter_requests_assigned_reviewer_id" ON "letter_requests" USING btree ("assigned_reviewer_id");--> statement-breakpoint
CREATE INDEX "idx_letter_requests_created_at" ON "letter_requests" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_letter_versions_letter_request_id" ON "letter_versions" USING btree ("letter_request_id");--> statement-breakpoint
CREATE INDEX "idx_notifications_user_id" ON "notifications" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_research_runs_letter_request_id" ON "research_runs" USING btree ("letter_request_id");--> statement-breakpoint
CREATE INDEX "idx_review_actions_letter_request_id" ON "review_actions" USING btree ("letter_request_id");--> statement-breakpoint
CREATE INDEX "idx_workflow_jobs_letter_request_id" ON "workflow_jobs" USING btree ("letter_request_id");--> statement-breakpoint
CREATE INDEX "idx_workflow_jobs_status" ON "workflow_jobs" USING btree ("status");