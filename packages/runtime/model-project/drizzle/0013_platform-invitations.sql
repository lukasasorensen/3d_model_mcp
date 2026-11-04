CREATE TABLE "platform_invitation" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"token_digest" text NOT NULL,
	"revoked_at" timestamp with time zone,
	"accepted_at" timestamp with time zone,
	CONSTRAINT "platform_invitation_token_digest_unique" UNIQUE("token_digest")
);
--> statement-breakpoint
ALTER TABLE "platform_invitation" ADD CONSTRAINT "platform_invitation_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "platform_invitation_open_email" ON "platform_invitation" USING btree ("email") WHERE "platform_invitation"."revoked_at" is null and "platform_invitation"."accepted_at" is null;