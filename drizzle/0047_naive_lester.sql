CREATE TABLE "client_portal_tokens" (
	"id" serial PRIMARY KEY NOT NULL,
	"letter_request_id" integer NOT NULL,
	"token" varchar(64) NOT NULL,
	"recipient_email" varchar(320),
	"recipient_name" varchar(500),
	"expires_at" timestamp with time zone NOT NULL,
	"viewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "client_portal_tokens_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "letter_analytics" (
	"id" serial PRIMARY KEY NOT NULL,
	"letter_request_id" integer NOT NULL,
	"pipeline_duration_ms" integer,
	"stage_durations_json" jsonb,
	"total_tokens" integer,
	"total_cost_cents" integer,
	"vetting_iterations" integer DEFAULT 1 NOT NULL,
	"quality_score" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "letter_analytics_letter_request_id_unique" UNIQUE("letter_request_id")
);
--> statement-breakpoint
CREATE TABLE "letter_delivery_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"letter_request_id" integer NOT NULL,
	"recipient_email" varchar(320),
	"recipient_name" varchar(500),
	"delivery_method" varchar(50) DEFAULT 'email' NOT NULL,
	"delivery_status" varchar(50) DEFAULT 'pending' NOT NULL,
	"resend_message_id" varchar(255),
	"delivered_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "letter_requests" ADD COLUMN "draft_ready_email_sent" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "blog_posts" ADD COLUMN "reviewed_by" varchar(200);--> statement-breakpoint
ALTER TABLE "blog_posts" ADD COLUMN "reviewed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "client_portal_tokens" ADD CONSTRAINT "client_portal_tokens_letter_request_id_letter_requests_id_fk" FOREIGN KEY ("letter_request_id") REFERENCES "public"."letter_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "letter_analytics" ADD CONSTRAINT "letter_analytics_letter_request_id_letter_requests_id_fk" FOREIGN KEY ("letter_request_id") REFERENCES "public"."letter_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "letter_delivery_log" ADD CONSTRAINT "letter_delivery_log_letter_request_id_letter_requests_id_fk" FOREIGN KEY ("letter_request_id") REFERENCES "public"."letter_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_client_portal_tokens_letter_request_id" ON "client_portal_tokens" USING btree ("letter_request_id");--> statement-breakpoint
CREATE INDEX "idx_client_portal_tokens_token" ON "client_portal_tokens" USING btree ("token");--> statement-breakpoint
CREATE INDEX "idx_letter_analytics_request_id" ON "letter_analytics" USING btree ("letter_request_id");--> statement-breakpoint
CREATE INDEX "idx_letter_delivery_log_request_id" ON "letter_delivery_log" USING btree ("letter_request_id");