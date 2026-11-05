ALTER TABLE "response_requests" ADD COLUMN "initial_email_sent_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "response_requests" ADD COLUMN "reminder_attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "response_requests" ADD COLUMN "last_reminder_attempt_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "response_requests" ADD CONSTRAINT "response_reminder_limit" CHECK ("response_requests"."reminder_attempts" BETWEEN 0 AND 2);