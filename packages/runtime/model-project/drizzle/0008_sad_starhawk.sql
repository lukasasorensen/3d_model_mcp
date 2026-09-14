ALTER TABLE "projects" ADD COLUMN "name" text DEFAULT 'Untitled project' NOT NULL;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "description" text DEFAULT '' NOT NULL;