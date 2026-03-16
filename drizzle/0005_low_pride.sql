CREATE TABLE "email_verification_tokens" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"token" varchar(128) NOT NULL,
	"email" varchar(320) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "email_verification_tokens_token_unique" UNIQUE("token")
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "email_verified" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE INDEX "idx_email_verification_tokens_token" ON "email_verification_tokens" USING btree ("token");--> statement-breakpoint
CREATE INDEX "idx_email_verification_tokens_user_id" ON "email_verification_tokens" USING btree ("user_id");