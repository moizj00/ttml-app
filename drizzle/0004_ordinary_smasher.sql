CREATE TYPE "public"."commission_status" AS ENUM('pending', 'paid', 'voided');--> statement-breakpoint
CREATE TYPE "public"."payout_status" AS ENUM('pending', 'processing', 'completed', 'rejected');--> statement-breakpoint
CREATE TABLE "commission_ledger" (
	"id" serial PRIMARY KEY NOT NULL,
	"employee_id" integer NOT NULL,
	"letter_request_id" integer,
	"subscriber_id" integer,
	"discount_code_id" integer,
	"stripe_payment_intent_id" varchar(255),
	"sale_amount" integer NOT NULL,
	"commission_rate" integer DEFAULT 500 NOT NULL,
	"commission_amount" integer NOT NULL,
	"status" "commission_status" DEFAULT 'pending' NOT NULL,
	"paid_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "discount_codes" (
	"id" serial PRIMARY KEY NOT NULL,
	"employee_id" integer NOT NULL,
	"code" varchar(50) NOT NULL,
	"discount_percent" integer DEFAULT 20 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"usage_count" integer DEFAULT 0 NOT NULL,
	"max_uses" integer,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "discount_codes_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "payout_requests" (
	"id" serial PRIMARY KEY NOT NULL,
	"employee_id" integer NOT NULL,
	"amount" integer NOT NULL,
	"payment_method" varchar(100) DEFAULT 'bank_transfer' NOT NULL,
	"payment_details" jsonb,
	"status" "payout_status" DEFAULT 'pending' NOT NULL,
	"processed_at" timestamp with time zone,
	"processed_by" integer,
	"rejection_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "idx_commission_ledger_employee_id" ON "commission_ledger" USING btree ("employee_id");--> statement-breakpoint
CREATE INDEX "idx_commission_ledger_status" ON "commission_ledger" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_commission_ledger_employee_status" ON "commission_ledger" USING btree ("employee_id","status");--> statement-breakpoint
CREATE INDEX "idx_discount_codes_code" ON "discount_codes" USING btree ("code");--> statement-breakpoint
CREATE INDEX "idx_discount_codes_employee_id" ON "discount_codes" USING btree ("employee_id");--> statement-breakpoint
CREATE INDEX "idx_payout_requests_employee_id" ON "payout_requests" USING btree ("employee_id");--> statement-breakpoint
CREATE INDEX "idx_payout_requests_status" ON "payout_requests" USING btree ("status");