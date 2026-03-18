ALTER TYPE "public"."letter_status" ADD VALUE 'client_approval_pending' BEFORE 'rejected';--> statement-breakpoint
ALTER TYPE "public"."letter_status" ADD VALUE 'client_approved' BEFORE 'rejected';--> statement-breakpoint
ALTER TYPE "public"."subscription_plan" ADD VALUE 'monthly_basic' BEFORE 'annual';