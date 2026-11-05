CREATE TABLE "user_profiles" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"display_name" text,
	"task_response_preference" text DEFAULT 'response-links' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_profiles_display_name_valid" CHECK ("user_profiles"."display_name" IS NULL OR (length("user_profiles"."display_name") BETWEEN 1 AND 200 AND "user_profiles"."display_name" !~ E'[\r\n]')),
	CONSTRAINT "user_profiles_response_preference_valid" CHECK ("user_profiles"."task_response_preference" IN ('response-links', 'task-notification'))
);
--> statement-breakpoint
ALTER TABLE "user_profiles" ADD CONSTRAINT "user_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;