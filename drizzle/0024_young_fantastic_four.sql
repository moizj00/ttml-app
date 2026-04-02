CREATE TABLE "admin_verification_codes" (
        "id" serial PRIMARY KEY NOT NULL,
        "user_id" integer NOT NULL,
        "code" varchar(8) NOT NULL,
        "expires_at" timestamp with time zone NOT NULL,
        "used" boolean DEFAULT false NOT NULL,
        "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "letter_requests" ADD COLUMN IF NOT EXISTS "submitter_role_id" varchar(16);--> statement-breakpoint
ALTER TABLE "letter_requests" ADD COLUMN IF NOT EXISTS "reviewer_role_id" varchar(16);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "subscriber_id" varchar(16);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "employee_id" varchar(16);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "attorney_id" varchar(16);--> statement-breakpoint
CREATE INDEX "idx_admin_verification_codes_user_id" ON "admin_verification_codes" USING btree ("user_id");--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_subscriber_id_unique" UNIQUE("subscriber_id");--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_employee_id_unique" UNIQUE("employee_id");--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_attorney_id_unique" UNIQUE("attorney_id");