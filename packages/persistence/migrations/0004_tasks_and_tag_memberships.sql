CREATE TYPE "public"."task_status" AS ENUM('pending', 'in_progress', 'completed');--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workflow_id" text NOT NULL,
	"step_code" text NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"user_tag_id" uuid NOT NULL,
	"status" "task_status" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone,
	"created_by" uuid,
	"updated_at" timestamp with time zone,
	"updated_by" uuid,
	"completed_at" timestamp with time zone,
	"completed_by" uuid,
	"audit_notes" text,
	CONSTRAINT "tasks_workflow_id_step_code_unique" UNIQUE("workflow_id","step_code"),
	CONSTRAINT "tasks_workflow_not_blank" CHECK ("tasks"."workflow_id" ~ '[^[:space:]]'),
	CONSTRAINT "tasks_step_code_format" CHECK ("tasks"."step_code" ~ '^[A-Za-z0-9-]+$'),
	CONSTRAINT "tasks_name_not_blank" CHECK ("tasks"."name" ~ '[^[:space:]]'),
	CONSTRAINT "tasks_description_not_blank" CHECK ("tasks"."description" ~ '[^[:space:]]')
);
--> statement-breakpoint
CREATE TABLE "user_tag_memberships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"user_tag_id" uuid NOT NULL,
	CONSTRAINT "user_tag_memberships_user_id_user_tag_id_unique" UNIQUE("user_id","user_tag_id")
);
--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_user_tag_id_user_tags_id_fk" FOREIGN KEY ("user_tag_id") REFERENCES "public"."user_tags"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_completed_by_users_id_fk" FOREIGN KEY ("completed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_tag_memberships" ADD CONSTRAINT "user_tag_memberships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_tag_memberships" ADD CONSTRAINT "user_tag_memberships_user_tag_id_user_tags_id_fk" FOREIGN KEY ("user_tag_id") REFERENCES "public"."user_tags"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "tasks_tag_status_idx" ON "tasks" USING btree ("user_tag_id","status");--> statement-breakpoint
CREATE INDEX "user_tag_memberships_tag_idx" ON "user_tag_memberships" USING btree ("user_tag_id");