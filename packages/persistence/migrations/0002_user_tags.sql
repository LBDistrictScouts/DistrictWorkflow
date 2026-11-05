CREATE TABLE "user_tags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tag_name" text NOT NULL,
	"tag_code" text NOT NULL,
	CONSTRAINT "user_tags_tag_code_unique" UNIQUE("tag_code"),
	CONSTRAINT "user_tags_name_not_blank" CHECK ("user_tags"."tag_name" ~ '[^[:space:]]'),
	CONSTRAINT "user_tags_code_format" CHECK ("user_tags"."tag_code" ~ '^[A-Za-z0-9-]+$')
);
