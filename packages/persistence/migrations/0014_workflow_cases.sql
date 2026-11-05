CREATE TABLE "workflow_case_executions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workflow_case_id" uuid NOT NULL,
	"workflow_execution_id" uuid NOT NULL,
	CONSTRAINT "workflow_case_executions_workflow_case_id_workflow_execution_id_unique" UNIQUE("workflow_case_id","workflow_execution_id")
);
--> statement-breakpoint
CREATE TABLE "workflow_cases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workflow_id" uuid NOT NULL,
	"workflow_definition_id" uuid,
	"reference" text NOT NULL,
	"title" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"outcome" text,
	"opened_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone,
	CONSTRAINT "workflow_cases_workflow_id_reference_unique" UNIQUE("workflow_id","reference"),
	CONSTRAINT "workflow_cases_status_valid" CHECK ("workflow_cases"."status" in ('open', 'completed', 'cancelled'))
);
--> statement-breakpoint
ALTER TABLE "award_progress" ADD COLUMN "workflow_case_id" uuid;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "workflow_case_id" uuid;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "workflow_case_id" uuid;--> statement-breakpoint
ALTER TABLE "training_fund_applications" ADD COLUMN "workflow_case_id" uuid;--> statement-breakpoint
ALTER TABLE "workflow_case_executions" ADD CONSTRAINT "workflow_case_executions_workflow_case_id_workflow_cases_id_fk" FOREIGN KEY ("workflow_case_id") REFERENCES "public"."workflow_cases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_case_executions" ADD CONSTRAINT "workflow_case_executions_workflow_execution_id_workflow_executions_id_fk" FOREIGN KEY ("workflow_execution_id") REFERENCES "public"."workflow_executions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_cases" ADD CONSTRAINT "workflow_cases_workflow_id_workflows_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "public"."workflows"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_cases" ADD CONSTRAINT "workflow_cases_workflow_definition_id_workflow_definitions_id_fk" FOREIGN KEY ("workflow_definition_id") REFERENCES "public"."workflow_definitions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "workflow_cases_status_idx" ON "workflow_cases" USING btree ("workflow_id","status");--> statement-breakpoint
ALTER TABLE "award_progress" ADD CONSTRAINT "award_progress_workflow_case_id_workflow_cases_id_fk" FOREIGN KEY ("workflow_case_id") REFERENCES "public"."workflow_cases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_workflow_case_id_workflow_cases_id_fk" FOREIGN KEY ("workflow_case_id") REFERENCES "public"."workflow_cases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_workflow_case_id_workflow_cases_id_fk" FOREIGN KEY ("workflow_case_id") REFERENCES "public"."workflow_cases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_fund_applications" ADD CONSTRAINT "training_fund_applications_workflow_case_id_workflow_cases_id_fk" FOREIGN KEY ("workflow_case_id") REFERENCES "public"."workflow_cases"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
INSERT INTO workflows (code,name,description,temporal_workflow_type)
VALUES ('training-fund','Training Fund','Training funding applications','trainingFundWorkflow') ON CONFLICT (code) DO NOTHING;
--> statement-breakpoint
CREATE FUNCTION project_application_case() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO workflow_cases (workflow_id,reference,title,status,outcome,opened_at,closed_at)
  SELECT id,NEW.application_id::text,NEW.state->'application'->'applicant'->>'name',
    CASE WHEN NEW.status='paid' THEN 'completed' ELSE 'open' END,NEW.status::text,NEW.submitted_at,
    CASE WHEN NEW.status='paid' THEN COALESCE((NEW.state->'payment'->>'recordedAt')::timestamptz,NEW.updated_at) END
  FROM workflows WHERE code='training-fund'
  ON CONFLICT (workflow_id,reference) DO NOTHING;
  SELECT c.id INTO NEW.workflow_case_id FROM workflow_cases c JOIN workflows w ON w.id=c.workflow_id
    WHERE w.code='training-fund' AND c.reference=NEW.application_id::text;
  IF TG_OP='UPDATE' THEN
    UPDATE workflow_cases SET status=CASE WHEN NEW.status='paid' THEN 'completed' ELSE 'open' END,
      outcome=NEW.status::text, closed_at=CASE WHEN NEW.status='paid' THEN COALESCE((NEW.state->'payment'->>'recordedAt')::timestamptz,NEW.updated_at) END
    WHERE id=NEW.workflow_case_id;
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER application_case BEFORE INSERT OR UPDATE ON training_fund_applications FOR EACH ROW EXECUTE FUNCTION project_application_case();
--> statement-breakpoint
UPDATE training_fund_applications SET workflow_case_id=workflow_case_id;
--> statement-breakpoint
CREATE FUNCTION project_award_case() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE case_id uuid; task_row tasks%ROWTYPE;
BEGIN
  IF TG_OP='INSERT' THEN
    SELECT workflow_case_id INTO case_id FROM award_progress WHERE task_id=NEW.task_id;
    IF FOUND THEN NEW.workflow_case_id := case_id; RETURN NEW; END IF;
  END IF;
  SELECT * INTO task_row FROM tasks WHERE id=NEW.task_id;
  INSERT INTO workflow_cases (workflow_id,workflow_definition_id,reference,title,status,outcome,opened_at,closed_at)
  SELECT d.workflow_id,d.id,NEW.task_id::text,
    COALESCE(task_row.context->'recipient'->>'name','Award') || ' · ' || COALESCE(task_row.context->>'description','Award'),
    CASE WHEN NEW.stage='presented' THEN 'completed' ELSE 'open' END,NEW.stage,
    COALESCE(task_row.created_at,now()),CASE WHEN NEW.stage='presented' THEN COALESCE(task_row.completed_at,now()) END
  FROM workflow_executions e JOIN workflow_definitions d ON d.id=e.workflow_definition_id WHERE e.id=task_row.workflow_execution_id
  ON CONFLICT (workflow_id,reference) DO UPDATE SET status=excluded.status,outcome=excluded.outcome,closed_at=excluded.closed_at
  RETURNING id INTO case_id;
  NEW.workflow_case_id := case_id;
  UPDATE tasks SET workflow_case_id=case_id WHERE id=NEW.task_id;
  INSERT INTO workflow_case_executions(workflow_case_id,workflow_execution_id) VALUES(case_id,task_row.workflow_execution_id) ON CONFLICT DO NOTHING;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER award_case BEFORE INSERT OR UPDATE ON award_progress FOR EACH ROW EXECUTE FUNCTION project_award_case();
--> statement-breakpoint
UPDATE award_progress SET workflow_case_id=workflow_case_id;
--> statement-breakpoint
CREATE FUNCTION associate_application_execution() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO workflow_case_executions(workflow_case_id,workflow_execution_id)
  SELECT workflow_case_id,NEW.id FROM training_fund_applications WHERE workflow_id=NEW.temporal_workflow_id
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER application_execution AFTER INSERT ON workflow_executions FOR EACH ROW EXECUTE FUNCTION associate_application_execution();
--> statement-breakpoint
INSERT INTO workflow_case_executions(workflow_case_id,workflow_execution_id)
SELECT a.workflow_case_id,e.id FROM training_fund_applications a JOIN workflow_executions e ON e.temporal_workflow_id=a.workflow_id ON CONFLICT DO NOTHING;

--> statement-breakpoint
CREATE FUNCTION link_application_case_runs() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO workflow_case_executions(workflow_case_id,workflow_execution_id)
  SELECT NEW.workflow_case_id,id FROM workflow_executions WHERE temporal_workflow_id=NEW.workflow_id ON CONFLICT DO NOTHING;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER application_case_runs AFTER INSERT OR UPDATE ON training_fund_applications FOR EACH ROW EXECUTE FUNCTION link_application_case_runs();
--> statement-breakpoint
CREATE FUNCTION inherit_single_execution_case() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.workflow_case_id IS NULL THEN
    SELECT (array_agg(workflow_case_id))[1] INTO NEW.workflow_case_id FROM workflow_case_executions
    WHERE workflow_execution_id=NEW.workflow_execution_id HAVING count(*)=1;
  END IF;
  IF NEW.workflow_case_id IS NOT NULL THEN
    INSERT INTO workflow_case_executions(workflow_case_id,workflow_execution_id)
    VALUES(NEW.workflow_case_id,NEW.workflow_execution_id) ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER task_case_association BEFORE INSERT OR UPDATE OF workflow_case_id ON tasks FOR EACH ROW EXECUTE FUNCTION inherit_single_execution_case();
--> statement-breakpoint
CREATE TRIGGER payment_case_association BEFORE INSERT OR UPDATE OF workflow_case_id ON payments FOR EACH ROW EXECUTE FUNCTION inherit_single_execution_case();
--> statement-breakpoint
UPDATE tasks SET workflow_case_id=workflow_case_id WHERE workflow_case_id IS NULL;
--> statement-breakpoint
UPDATE payments SET workflow_case_id=workflow_case_id WHERE workflow_case_id IS NULL;
