-- Legacy tasks lack a trustworthy Temporal Run ID. Never invent execution identities.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM tasks) THEN
    RAISE EXCEPTION 'Legacy tasks require an explicit execution/definition backfill before migration 0005';
  END IF;
END $$;
--> statement-breakpoint
CREATE TYPE "public"."workflow_execution_status" AS ENUM('running', 'completed', 'failed', 'canceled', 'terminated', 'continued_as_new', 'timed_out');--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workflow_execution_id" uuid NOT NULL,
	"payee_name" text NOT NULL,
	"amount_pence" integer NOT NULL,
	"transaction_date" date,
	"transaction_reference" text,
	"recorded_at" timestamp with time zone,
	"recorded_by" uuid,
	CONSTRAINT "payments_positive_amount" CHECK ("payments"."amount_pence" > 0),
	CONSTRAINT "payments_payee_not_blank" CHECK ("payments"."payee_name" ~ '[^[:space:]]')
);
--> statement-breakpoint
CREATE TABLE "task_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task_id" uuid NOT NULL,
	"payment_id" uuid NOT NULL,
	CONSTRAINT "task_payments_task_id_payment_id_unique" UNIQUE("task_id","payment_id")
);
--> statement-breakpoint
CREATE TABLE "task_submissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task_id" uuid NOT NULL,
	"answers" jsonb NOT NULL,
	"submitted_by" uuid NOT NULL,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "task_type_definitions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task_type_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"input_schema" jsonb NOT NULL,
	"output_schema" jsonb NOT NULL,
	"ui_schema" jsonb NOT NULL,
	"published_at" timestamp with time zone,
	CONSTRAINT "task_type_definitions_task_type_id_version_unique" UNIQUE("task_type_id","version"),
	CONSTRAINT "task_type_definition_positive_version" CHECK ("task_type_definitions"."version" > 0),
	CONSTRAINT "task_type_definition_schema_objects" CHECK (jsonb_typeof("task_type_definitions"."input_schema") = 'object' AND jsonb_typeof("task_type_definitions"."output_schema") = 'object' AND jsonb_typeof("task_type_definitions"."ui_schema") = 'object')
);
--> statement-breakpoint
CREATE TABLE "task_types" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	CONSTRAINT "task_types_code_unique" UNIQUE("code"),
	CONSTRAINT "task_types_code_format" CHECK ("task_types"."code" ~ '^[A-Za-z0-9-]+$')
);
--> statement-breakpoint
CREATE TABLE "workflow_definitions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workflow_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"published_at" timestamp with time zone,
	CONSTRAINT "workflow_definitions_workflow_id_version_unique" UNIQUE("workflow_id","version"),
	CONSTRAINT "workflow_definition_positive_version" CHECK ("workflow_definitions"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE "workflow_executions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workflow_definition_id" uuid NOT NULL,
	"namespace" text NOT NULL,
	"temporal_workflow_id" text NOT NULL,
	"temporal_run_id" uuid NOT NULL,
	"first_execution_run_id" uuid,
	"status" "workflow_execution_status" DEFAULT 'running' NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"closed_at" timestamp with time zone,
	CONSTRAINT "workflow_executions_namespace_temporal_workflow_id_temporal_run_id_unique" UNIQUE("namespace","temporal_workflow_id","temporal_run_id"),
	CONSTRAINT "execution_identity_not_blank" CHECK ("workflow_executions"."namespace" ~ '[^[:space:]]' AND "workflow_executions"."temporal_workflow_id" ~ '[^[:space:]]')
);
--> statement-breakpoint
CREATE TABLE "workflow_steps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workflow_definition_id" uuid NOT NULL,
	"task_type_definition_id" uuid NOT NULL,
	"step_code" text NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"user_tag_id" uuid NOT NULL,
	CONSTRAINT "workflow_steps_workflow_definition_id_step_code_unique" UNIQUE("workflow_definition_id","step_code"),
	CONSTRAINT "workflow_steps_code_format" CHECK ("workflow_steps"."step_code" ~ '^[A-Za-z0-9-]+$'),
	CONSTRAINT "workflow_steps_text_not_blank" CHECK ("workflow_steps"."name" ~ '[^[:space:]]' AND "workflow_steps"."description" ~ '[^[:space:]]')
);
--> statement-breakpoint
CREATE TABLE "workflows" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"temporal_workflow_type" text NOT NULL,
	CONSTRAINT "workflows_code_unique" UNIQUE("code"),
	CONSTRAINT "workflows_code_format" CHECK ("workflows"."code" ~ '^[A-Za-z0-9-]+$')
);
--> statement-breakpoint
ALTER TABLE "tasks" DROP CONSTRAINT "tasks_workflow_id_step_code_unique";--> statement-breakpoint
ALTER TABLE "tasks" DROP CONSTRAINT "tasks_workflow_not_blank";--> statement-breakpoint
ALTER TABLE "tasks" DROP CONSTRAINT "tasks_step_code_format";--> statement-breakpoint
ALTER TABLE "tasks" DROP CONSTRAINT "tasks_name_not_blank";--> statement-breakpoint
ALTER TABLE "tasks" DROP CONSTRAINT "tasks_description_not_blank";--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "workflow_execution_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "workflow_step_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "occurrence" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "context" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "draft_answers" jsonb;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_workflow_execution_id_workflow_executions_id_fk" FOREIGN KEY ("workflow_execution_id") REFERENCES "public"."workflow_executions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_recorded_by_users_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_payments" ADD CONSTRAINT "task_payments_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_payments" ADD CONSTRAINT "task_payments_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_submissions" ADD CONSTRAINT "task_submissions_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_submissions" ADD CONSTRAINT "task_submissions_submitted_by_users_id_fk" FOREIGN KEY ("submitted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_type_definitions" ADD CONSTRAINT "task_type_definitions_task_type_id_task_types_id_fk" FOREIGN KEY ("task_type_id") REFERENCES "public"."task_types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_definitions" ADD CONSTRAINT "workflow_definitions_workflow_id_workflows_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "public"."workflows"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_executions" ADD CONSTRAINT "workflow_executions_workflow_definition_id_workflow_definitions_id_fk" FOREIGN KEY ("workflow_definition_id") REFERENCES "public"."workflow_definitions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_steps" ADD CONSTRAINT "workflow_steps_workflow_definition_id_workflow_definitions_id_fk" FOREIGN KEY ("workflow_definition_id") REFERENCES "public"."workflow_definitions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_steps" ADD CONSTRAINT "workflow_steps_task_type_definition_id_task_type_definitions_id_fk" FOREIGN KEY ("task_type_definition_id") REFERENCES "public"."task_type_definitions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_steps" ADD CONSTRAINT "workflow_steps_user_tag_id_user_tags_id_fk" FOREIGN KEY ("user_tag_id") REFERENCES "public"."user_tags"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "task_submissions_task_idx" ON "task_submissions" USING btree ("task_id");--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_workflow_execution_id_workflow_executions_id_fk" FOREIGN KEY ("workflow_execution_id") REFERENCES "public"."workflow_executions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_workflow_step_id_workflow_steps_id_fk" FOREIGN KEY ("workflow_step_id") REFERENCES "public"."workflow_steps"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" DROP COLUMN "workflow_id";--> statement-breakpoint
ALTER TABLE "tasks" DROP COLUMN "step_code";--> statement-breakpoint
ALTER TABLE "tasks" DROP COLUMN "name";--> statement-breakpoint
ALTER TABLE "tasks" DROP COLUMN "description";--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_workflow_execution_id_workflow_step_id_occurrence_unique" UNIQUE("workflow_execution_id","workflow_step_id","occurrence");--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_positive_occurrence" CHECK ("tasks"."occurrence" > 0);
--> statement-breakpoint
CREATE FUNCTION protect_published_definition() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.published_at IS NOT NULL THEN
    RAISE EXCEPTION 'Published definitions are immutable; create a new version';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER workflow_definition_immutable BEFORE UPDATE OR DELETE ON workflow_definitions
FOR EACH ROW EXECUTE FUNCTION protect_published_definition();
--> statement-breakpoint
CREATE TRIGGER task_type_definition_immutable BEFORE UPDATE OR DELETE ON task_type_definitions
FOR EACH ROW EXECUTE FUNCTION protect_published_definition();
--> statement-breakpoint
CREATE FUNCTION protect_workflow_step() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE published timestamptz;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    SELECT published_at INTO published FROM workflow_definitions WHERE id = OLD.workflow_definition_id FOR UPDATE;
    IF published IS NOT NULL THEN RAISE EXCEPTION 'Published workflow steps are immutable'; END IF;
  END IF;
  IF TG_OP <> 'DELETE' THEN
    SELECT published_at INTO published FROM workflow_definitions WHERE id = NEW.workflow_definition_id FOR UPDATE;
    IF published IS NOT NULL THEN RAISE EXCEPTION 'Cannot add steps to a published workflow'; END IF;
    PERFORM 1 FROM task_type_definitions WHERE id = NEW.task_type_definition_id AND published_at IS NOT NULL FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Steps require a published task type definition'; END IF;
    RETURN NEW;
  END IF;
  RETURN OLD;
END $$;
--> statement-breakpoint
CREATE TRIGGER workflow_step_immutable BEFORE INSERT OR UPDATE OR DELETE ON workflow_steps
FOR EACH ROW EXECUTE FUNCTION protect_workflow_step();
--> statement-breakpoint
CREATE FUNCTION validate_execution_definition() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND (NEW.workflow_definition_id, NEW.namespace, NEW.temporal_workflow_id, NEW.temporal_run_id)
    IS DISTINCT FROM (OLD.workflow_definition_id, OLD.namespace, OLD.temporal_workflow_id, OLD.temporal_run_id) THEN
    RAISE EXCEPTION 'Execution identity and definition are immutable';
  END IF;
  PERFORM 1 FROM workflow_definitions WHERE id = NEW.workflow_definition_id AND published_at IS NOT NULL FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Execution requires a published workflow definition'; END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER execution_definition BEFORE INSERT OR UPDATE ON workflow_executions
FOR EACH ROW EXECUTE FUNCTION validate_execution_definition();
--> statement-breakpoint
CREATE FUNCTION validate_task_definition() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND (NEW.workflow_execution_id, NEW.workflow_step_id, NEW.occurrence)
    IS DISTINCT FROM (OLD.workflow_execution_id, OLD.workflow_step_id, OLD.occurrence) THEN
    RAISE EXCEPTION 'Task occurrence identity is immutable';
  END IF;
  PERFORM 1 FROM workflow_executions e JOIN workflow_steps s ON s.workflow_definition_id = e.workflow_definition_id
    WHERE e.id = NEW.workflow_execution_id AND s.id = NEW.workflow_step_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Task step must belong to the execution definition'; END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER task_definition BEFORE INSERT OR UPDATE ON tasks
FOR EACH ROW EXECUTE FUNCTION validate_task_definition();
--> statement-breakpoint
CREATE FUNCTION protect_task_submission() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Task submissions are append-only'; END $$;
--> statement-breakpoint
CREATE TRIGGER submission_immutable BEFORE UPDATE OR DELETE ON task_submissions
FOR EACH ROW EXECUTE FUNCTION protect_task_submission();
