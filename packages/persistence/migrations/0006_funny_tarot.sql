-- A user-level assignment cannot safely grant every alias the same tag.
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM user_tag_memberships m
    WHERE (SELECT count(*) FROM user_emails e WHERE e.user_id = m.user_id) <> 1
  ) THEN
    RAISE EXCEPTION 'Resolve legacy tag memberships with zero or multiple emails before migration';
  END IF;
END $$;
--> statement-breakpoint
ALTER TABLE "user_tag_memberships" DROP CONSTRAINT "user_tag_memberships_user_id_user_tag_id_unique";--> statement-breakpoint
ALTER TABLE "user_tag_memberships" DROP CONSTRAINT "user_tag_memberships_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "user_tag_memberships" ADD COLUMN "user_email_id" uuid;
--> statement-breakpoint
UPDATE user_tag_memberships m SET user_email_id = e.id FROM user_emails e WHERE e.user_id = m.user_id;
--> statement-breakpoint
ALTER TABLE user_tag_memberships ALTER COLUMN user_email_id SET NOT NULL;--> statement-breakpoint
ALTER TABLE "user_tag_memberships" ADD CONSTRAINT "user_tag_memberships_user_email_id_user_emails_id_fk" FOREIGN KEY ("user_email_id") REFERENCES "public"."user_emails"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_tag_memberships" DROP COLUMN "user_id";--> statement-breakpoint
ALTER TABLE "user_tag_memberships" ADD CONSTRAINT "user_tag_memberships_user_email_id_user_tag_id_unique" UNIQUE("user_email_id","user_tag_id");