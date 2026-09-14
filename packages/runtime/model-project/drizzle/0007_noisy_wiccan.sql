ALTER TABLE "browser_presence" ADD COLUMN "tab_id" text DEFAULT gen_random_uuid()::text NOT NULL;--> statement-breakpoint
ALTER TABLE "browser_presence" DROP CONSTRAINT "browser_presence_owner_id_project_id_session_id_pk";--> statement-breakpoint
ALTER TABLE "browser_presence" ADD CONSTRAINT "browser_presence_owner_id_project_id_tab_id_pk" PRIMARY KEY("owner_id","project_id","tab_id");
