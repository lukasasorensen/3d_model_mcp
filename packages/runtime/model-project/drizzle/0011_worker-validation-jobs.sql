CREATE TABLE "worker_validation_jobs" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"project_id" text NOT NULL,
	"candidate_id" text NOT NULL,
	"attempt_id" text NOT NULL,
	"source_hash" text NOT NULL,
	"token_hash" text NOT NULL,
	"state" "render_job_state" DEFAULT 'PENDING' NOT NULL,
	"deadline" timestamp with time zone NOT NULL,
	"completion_hash" text,
	"completion" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "worker_validation_jobs" ADD CONSTRAINT "worker_validation_jobs_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "worker_validation_jobs" ADD CONSTRAINT "worker_validation_jobs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "worker_validation_jobs" ADD CONSTRAINT "worker_validation_jobs_candidate_id_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."candidates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "worker_validation_jobs" ADD CONSTRAINT "worker_validation_jobs_attempt_id_validation_attempts_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."validation_attempts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "worker_validation_jobs_attempt_idx" ON "worker_validation_jobs" USING btree ("attempt_id");--> statement-breakpoint
CREATE INDEX "worker_validation_jobs_owner_state_idx" ON "worker_validation_jobs" USING btree ("owner_id","state");