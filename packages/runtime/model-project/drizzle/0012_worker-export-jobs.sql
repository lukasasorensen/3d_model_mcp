CREATE TYPE "public"."worker_export_state" AS ENUM('PENDING', 'COMPLETED', 'CANCELLED', 'FAILED', 'EXPIRED');--> statement-breakpoint
CREATE TABLE "worker_export_jobs" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"project_id" text NOT NULL,
	"export_id" text NOT NULL,
	"revision_id" text NOT NULL,
	"source_hash" text NOT NULL,
	"format" text NOT NULL,
	"token_hash" text NOT NULL,
	"state" "worker_export_state" DEFAULT 'PENDING' NOT NULL,
	"deadline" timestamp with time zone NOT NULL,
	"retain_until" timestamp with time zone NOT NULL,
	"completion_hash" text,
	"completion" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "worker_export_jobs" ADD CONSTRAINT "worker_export_jobs_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "worker_export_jobs" ADD CONSTRAINT "worker_export_jobs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "worker_export_jobs_export_idx" ON "worker_export_jobs" USING btree ("export_id");--> statement-breakpoint
CREATE INDEX "worker_export_jobs_owner_state_idx" ON "worker_export_jobs" USING btree ("owner_id","state");--> statement-breakpoint
CREATE INDEX "worker_export_jobs_retention_idx" ON "worker_export_jobs" USING btree ("retain_until");