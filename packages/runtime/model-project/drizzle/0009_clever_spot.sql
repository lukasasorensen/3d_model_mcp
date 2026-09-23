CREATE TABLE "validation_attempts" (
	"id" text PRIMARY KEY NOT NULL,
	"candidate_id" text NOT NULL,
	"state" text NOT NULL,
	"error" jsonb,
	"deadline" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "model_exports" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"project_id" text NOT NULL,
	"revision_id" text NOT NULL,
	"source_hash" text NOT NULL,
	"format" text NOT NULL,
	"mode" text NOT NULL,
	"state" text NOT NULL,
	"reserved_bytes" integer NOT NULL,
	"session_id" text,
	"token_hash" text,
	"metadata" jsonb,
	"deadline" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "export_download_tokens" (
	"hash" text PRIMARY KEY NOT NULL,
	"export_id" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "candidates" ADD COLUMN "active_attempt_id" text;--> statement-breakpoint
ALTER TABLE "candidates" ADD COLUMN "geometry" jsonb;--> statement-breakpoint
ALTER TABLE "revisions" ADD COLUMN "geometry" jsonb;--> statement-breakpoint
ALTER TABLE "validation_attempts" ADD CONSTRAINT "validation_attempts_candidate_id_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."candidates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "model_exports" ADD CONSTRAINT "model_exports_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "model_exports" ADD CONSTRAINT "model_exports_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "export_download_tokens" ADD CONSTRAINT "export_download_tokens_export_id_model_exports_id_fk" FOREIGN KEY ("export_id") REFERENCES "public"."model_exports"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "model_exports_owner_idx" ON "model_exports" USING btree ("owner_id","project_id");