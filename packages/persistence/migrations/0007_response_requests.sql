CREATE TABLE "response_requests" (
	"task_id" uuid PRIMARY KEY NOT NULL,
	"request" jsonb NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"answer_ciphertext" text,
	"completed_by" uuid,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "response_completion_consistent" CHECK (("response_requests"."answer_ciphertext" IS NULL AND "response_requests"."completed_at" IS NULL AND "response_requests"."completed_by" IS NULL) OR ("response_requests"."answer_ciphertext" IS NOT NULL AND "response_requests"."completed_at" IS NOT NULL AND "response_requests"."completed_by" IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "response_requests" ADD CONSTRAINT "response_requests_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "response_requests" ADD CONSTRAINT "response_requests_completed_by_users_id_fk" FOREIGN KEY ("completed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;