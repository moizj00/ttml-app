CREATE TABLE "intake_form_templates" (
	"id" serial PRIMARY KEY NOT NULL,
	"owner_user_id" integer NOT NULL,
	"title" varchar(200) NOT NULL,
	"base_letter_type" "letter_type" NOT NULL,
	"field_config" jsonb NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "idx_intake_form_templates_owner" ON "intake_form_templates" USING btree ("owner_user_id");--> statement-breakpoint
CREATE INDEX "idx_intake_form_templates_letter_type" ON "intake_form_templates" USING btree ("base_letter_type");