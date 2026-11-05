ALTER TABLE "training_fund_transitions" DROP CONSTRAINT "training_fund_transitions_application_id_revision_pk";--> statement-breakpoint
ALTER TABLE "user_emails" DROP CONSTRAINT "user_emails_user_id_email_pk";--> statement-breakpoint
ALTER TABLE "training_fund_transitions" ADD COLUMN "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL;--> statement-breakpoint
ALTER TABLE "user_emails" ADD COLUMN "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL;--> statement-breakpoint
ALTER TABLE "training_fund_transitions" ADD CONSTRAINT "training_fund_transitions_application_id_revision_unique" UNIQUE("application_id","revision");--> statement-breakpoint
ALTER TABLE "user_emails" ADD CONSTRAINT "user_emails_user_id_email_unique" UNIQUE("user_id","email");