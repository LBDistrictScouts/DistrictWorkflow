CREATE TABLE "activity_notification_applications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workflow_case_id" uuid NOT NULL,
	"environment" text NOT NULL,
	"submission_id" text NOT NULL,
	"idempotence_key" uuid NOT NULL,
	"submission" jsonb NOT NULL,
	CONSTRAINT "activity_notification_applications_workflow_case_id_unique" UNIQUE("workflow_case_id"),
	CONSTRAINT "activity_notification_applications_environment_submission_id_unique" UNIQUE("environment","submission_id"),
	CONSTRAINT "activity_notification_applications_environment_idempotence_key_unique" UNIQUE("environment","idempotence_key")
);
--> statement-breakpoint
ALTER TABLE "activity_notification_applications" ADD CONSTRAINT "activity_notification_applications_workflow_case_id_workflow_cases_id_fk" FOREIGN KEY ("workflow_case_id") REFERENCES "public"."workflow_cases"("id") ON DELETE no action ON UPDATE no action;