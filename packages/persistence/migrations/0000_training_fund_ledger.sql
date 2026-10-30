CREATE TYPE "public"."training_fund_status" AS ENUM('awaiting_approvals', 'awaiting_payment', 'paid');--> statement-breakpoint
CREATE TABLE "training_fund_applications" (
	"application_id" uuid PRIMARY KEY NOT NULL,
	"workflow_id" text NOT NULL,
	"status" "training_fund_status" NOT NULL,
	"revision" integer NOT NULL,
	"submitted_at" timestamp with time zone NOT NULL,
	"state" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "training_fund_applications_workflow_id_unique" UNIQUE("workflow_id"),
	CONSTRAINT "training_fund_revision_nonnegative" CHECK ("training_fund_applications"."revision" >= 0),
	CONSTRAINT "training_fund_state_id_matches" CHECK (("training_fund_applications"."state"->'application'->>'applicationId')::uuid = "training_fund_applications"."application_id"),
	CONSTRAINT "training_fund_state_status_matches" CHECK ("training_fund_applications"."state"->>'status' = "training_fund_applications"."status"::text)
);
--> statement-breakpoint
CREATE TABLE "training_fund_transitions" (
	"application_id" uuid NOT NULL,
	"revision" integer NOT NULL,
	"status" "training_fund_status" NOT NULL,
	"state" jsonb NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "training_fund_transitions_application_id_revision_pk" PRIMARY KEY("application_id","revision"),
	CONSTRAINT "training_fund_transition_revision_nonnegative" CHECK ("training_fund_transitions"."revision" >= 0),
	CONSTRAINT "training_fund_transition_state_id_matches" CHECK (("training_fund_transitions"."state"->'application'->>'applicationId')::uuid = "training_fund_transitions"."application_id"),
	CONSTRAINT "training_fund_transition_state_status_matches" CHECK ("training_fund_transitions"."state"->>'status' = "training_fund_transitions"."status"::text)
);
--> statement-breakpoint
ALTER TABLE "training_fund_transitions" ADD CONSTRAINT "training_fund_transitions_application_id_training_fund_applications_application_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."training_fund_applications"("application_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "training_fund_status_submitted_idx" ON "training_fund_applications" USING btree ("status","submitted_at");