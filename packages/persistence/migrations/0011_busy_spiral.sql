CREATE TABLE "award_progress" (
	"task_id" uuid PRIMARY KEY NOT NULL,
	"stage" text DEFAULT 'listed' NOT NULL,
	"received_at" timestamp with time zone,
	"presentation_date" date,
	"schedule_revision" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "award_stage_valid" CHECK ("award_progress"."stage" in ('listed', 'received', 'scheduled', 'presented')),
	CONSTRAINT "award_schedule_required" CHECK ("award_progress"."stage" <> 'scheduled' or "award_progress"."presentation_date" is not null)
);
--> statement-breakpoint
CREATE TABLE "award_reminders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task_id" uuid NOT NULL,
	"schedule_revision" integer NOT NULL,
	"days_before" integer NOT NULL,
	"user_id" uuid NOT NULL,
	"email" text NOT NULL,
	"status" text DEFAULT 'claimed' NOT NULL,
	"attempted_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "award_reminders_task_id_schedule_revision_days_before_user_id_unique" UNIQUE("task_id","schedule_revision","days_before","user_id")
);
--> statement-breakpoint
ALTER TABLE "award_progress" ADD CONSTRAINT "award_progress_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "award_reminders" ADD CONSTRAINT "award_reminders_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "award_reminders" ADD CONSTRAINT "award_reminders_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
INSERT INTO award_progress (task_id, stage)
SELECT t.id, CASE WHEN t.status = 'completed' THEN 'presented' ELSE 'listed' END
FROM tasks t JOIN workflow_steps s ON s.id = t.workflow_step_id
WHERE s.step_code = 'present-award' ON CONFLICT DO NOTHING;
