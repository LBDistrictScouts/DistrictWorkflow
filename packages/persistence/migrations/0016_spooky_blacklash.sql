CREATE TABLE "activity_notification_statistics" (
	"workflow_case_id" uuid PRIMARY KEY NOT NULL,
	"environment" text NOT NULL,
	"notification_type" text NOT NULL,
	"activity" text NOT NULL,
	"location" text NOT NULL,
	"venue_name" text NOT NULL,
	"time_zone" text NOT NULL,
	"submitted_at" timestamp with time zone NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"approved_at" timestamp with time zone NOT NULL,
	"approved_by" uuid NOT NULL,
	"groups" jsonb NOT NULL,
	"sections" jsonb NOT NULL,
	"section_ids" jsonb NOT NULL,
	"section_participants" jsonb NOT NULL,
	"young_people" integer NOT NULL,
	"young_leaders" integer NOT NULL,
	"adults" integer NOT NULL,
	"external_provider" integer
);
--> statement-breakpoint
ALTER TABLE "activity_notification_applications" ADD COLUMN "approval_notified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "activity_notification_applications" ADD COLUMN "approval_message_id" text;--> statement-breakpoint
ALTER TABLE "activity_notification_statistics" ADD CONSTRAINT "activity_notification_statistics_workflow_case_id_workflow_cases_id_fk" FOREIGN KEY ("workflow_case_id") REFERENCES "public"."workflow_cases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_notification_statistics" ADD CONSTRAINT "activity_notification_statistics_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "activity_statistics_environment_starts_idx" ON "activity_notification_statistics" USING btree ("environment","starts_at");--> statement-breakpoint
CREATE INDEX "activity_statistics_type_approved_idx" ON "activity_notification_statistics" USING btree ("notification_type","approved_at");