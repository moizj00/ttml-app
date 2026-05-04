ALTER TYPE "public"."letter_status" ADD VALUE 'assembling' BEFORE 'ai_generation_completed_hidden';--> statement-breakpoint
ALTER TYPE "public"."letter_status" ADD VALUE 'vetting' BEFORE 'ai_generation_completed_hidden';--> statement-breakpoint
ALTER TYPE "public"."letter_status" ADD VALUE 'attorney_review_checkout_started' BEFORE 'generated_locked';--> statement-breakpoint
ALTER TYPE "public"."letter_status" ADD VALUE 'attorney_review_payment_confirmed' BEFORE 'generated_locked';--> statement-breakpoint
CREATE TABLE "pipeline_stream_chunks" (
	"id" bigint PRIMARY KEY NOT NULL,
	"letter_id" integer NOT NULL,
	"chunk_text" text NOT NULL,
	"stage" varchar(50) DEFAULT 'draft' NOT NULL,
	"sequence_number" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "pipeline_stream_chunks" ADD CONSTRAINT "pipeline_stream_chunks_letter_id_letter_requests_id_fk" FOREIGN KEY ("letter_id") REFERENCES "public"."letter_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_pipeline_stream_chunks_letter_id" ON "pipeline_stream_chunks" USING btree ("letter_id");--> statement-breakpoint
CREATE INDEX "idx_pipeline_stream_chunks_letter_sequence" ON "pipeline_stream_chunks" USING btree ("letter_id","sequence_number");