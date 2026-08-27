CREATE TYPE "public"."candidate_state" AS ENUM('CREATED', 'RUNNING', 'VALID', 'REJECTED', 'PROMOTED', 'SUPERSEDED');--> statement-breakpoint
CREATE TYPE "public"."render_job_state" AS ENUM('PENDING', 'COMPLETED', 'CANCELLED', 'EXPIRED');--> statement-breakpoint
CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "browser_render_jobs" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"project_id" text NOT NULL,
	"candidate_id" text NOT NULL,
	"session_id" text NOT NULL,
	"token_hash" text NOT NULL,
	"source_hash" text NOT NULL,
	"state" "render_job_state" DEFAULT 'PENDING' NOT NULL,
	"completion" jsonb,
	"deadline" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "candidate_artifacts" (
	"candidate_id" text NOT NULL,
	"format" text NOT NULL,
	"metadata" jsonb NOT NULL,
	"object_key" text,
	CONSTRAINT "candidate_artifacts_candidate_id_format_pk" PRIMARY KEY("candidate_id","format"),
	CONSTRAINT "candidate_artifact_format_check" CHECK ("candidate_artifacts"."format" IN ('stl', '3mf'))
);
--> statement-breakpoint
CREATE TABLE "candidates" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"parent_revision_id" text,
	"source" text NOT NULL,
	"source_hash" text NOT NULL,
	"source_bytes" integer NOT NULL,
	"state" "candidate_state" NOT NULL,
	"request_id" text NOT NULL,
	"tool_call_id" text NOT NULL,
	"validation_policy_version" text,
	"diagnostics" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"renderer" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "candidates_source_hash_check" CHECK ("candidates"."source_hash" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "candidates_source_bytes_check" CHECK ("candidates"."source_bytes" > 0 AND "candidates"."source_bytes" <= 262144)
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"current_revision_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "revision_artifacts" (
	"revision_id" text NOT NULL,
	"format" text NOT NULL,
	"metadata" jsonb NOT NULL,
	"object_key" text,
	CONSTRAINT "revision_artifacts_revision_id_format_pk" PRIMARY KEY("revision_id","format"),
	CONSTRAINT "revision_artifact_format_check" CHECK ("revision_artifacts"."format" IN ('stl', '3mf'))
);
--> statement-breakpoint
CREATE TABLE "revisions" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"parent_revision_id" text,
	"restored_from_revision_id" text,
	"source" text NOT NULL,
	"source_hash" text NOT NULL,
	"source_bytes" integer NOT NULL,
	"request_id" text NOT NULL,
	"tool_call_id" text NOT NULL,
	"candidate_id" text NOT NULL,
	"validation_policy_version" text NOT NULL,
	"diagnostics" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"renderer" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "revisions_source_hash_check" CHECK ("revisions"."source_hash" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "revisions_source_bytes_check" CHECK ("revisions"."source_bytes" > 0 AND "revisions"."source_bytes" <= 262144)
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "browser_render_jobs" ADD CONSTRAINT "browser_render_jobs_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "browser_render_jobs" ADD CONSTRAINT "browser_render_jobs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidate_artifacts" ADD CONSTRAINT "candidate_artifacts_candidate_id_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."candidates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidates" ADD CONSTRAINT "candidates_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "revision_artifacts" ADD CONSTRAINT "revision_artifacts_revision_id_revisions_id_fk" FOREIGN KEY ("revision_id") REFERENCES "public"."revisions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "revisions" ADD CONSTRAINT "revisions_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_user_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "browser_render_jobs_pending_idx" ON "browser_render_jobs" USING btree ("state","deadline");--> statement-breakpoint
CREATE INDEX "candidates_project_state_idx" ON "candidates" USING btree ("project_id","state");--> statement-breakpoint
CREATE INDEX "projects_owner_created_idx" ON "projects" USING btree ("owner_id","created_at");--> statement-breakpoint
CREATE INDEX "revisions_project_created_idx" ON "revisions" USING btree ("project_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "revisions_project_id_unique" ON "revisions" USING btree ("project_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "session_token_unique" ON "session" USING btree ("token");--> statement-breakpoint
CREATE INDEX "session_user_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "user_email_unique" ON "user" USING btree ("email");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" USING btree ("identifier");