ALTER TABLE "commission_ledger"
  ADD COLUMN IF NOT EXISTS "stripe_invoice_id" varchar(255);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_commission_ledger_stripe_invoice"
  ON "commission_ledger" USING btree ("stripe_invoice_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "commission_payout_allocations" (
  "id" serial PRIMARY KEY NOT NULL,
  "payout_request_id" integer NOT NULL,
  "commission_id" integer NOT NULL,
  "amount" integer NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'commission_payout_allocations_payout_request_id_payout_requests_id_fk'
  ) THEN
    ALTER TABLE "commission_payout_allocations"
      ADD CONSTRAINT "commission_payout_allocations_payout_request_id_payout_requests_id_fk"
      FOREIGN KEY ("payout_request_id") REFERENCES "public"."payout_requests"("id")
      ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'commission_payout_allocations_commission_id_commission_ledger_id_fk'
  ) THEN
    ALTER TABLE "commission_payout_allocations"
      ADD CONSTRAINT "commission_payout_allocations_commission_id_commission_ledger_id_fk"
      FOREIGN KEY ("commission_id") REFERENCES "public"."commission_ledger"("id")
      ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_commission_payout_allocations_payout"
  ON "commission_payout_allocations" USING btree ("payout_request_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_commission_payout_allocations_commission"
  ON "commission_payout_allocations" USING btree ("commission_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_commission_payout_allocations_commission"
  ON "commission_payout_allocations" USING btree ("commission_id");
