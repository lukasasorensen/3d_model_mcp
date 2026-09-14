CREATE TABLE "browser_presence" (
	"owner_id" text NOT NULL,
	"project_id" text NOT NULL,
	"session_id" text NOT NULL,
	"status" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "browser_presence_owner_id_project_id_session_id_pk" PRIMARY KEY("owner_id","project_id","session_id")
);
--> statement-breakpoint
CREATE TABLE "browser_preview_jobs" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"project_id" text NOT NULL,
	"metadata" jsonb NOT NULL,
	"source" text NOT NULL,
	"delivery_mode" "render_delivery_mode" NOT NULL,
	"state" "render_job_state" DEFAULT 'PENDING' NOT NULL,
	"session_id" text,
	"token_hash" text,
	"claimed_at" timestamp with time zone,
	"claim_deadline" timestamp with time zone NOT NULL,
	"deadline" timestamp with time zone NOT NULL,
	"completion" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "browser_presence" ADD CONSTRAINT "browser_presence_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "browser_presence" ADD CONSTRAINT "browser_presence_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "browser_preview_jobs" ADD CONSTRAINT "browser_preview_jobs_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "browser_preview_jobs" ADD CONSTRAINT "browser_preview_jobs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "browser_preview_jobs_active_idx" ON "browser_preview_jobs" USING btree ("owner_id","project_id") WHERE "browser_preview_jobs"."state" = 'PENDING';