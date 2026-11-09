CREATE TABLE "ai_companions" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"name" text NOT NULL,
	"provider" text NOT NULL,
	"secret_hash" text NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_connections" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"name" text NOT NULL,
	"provider" text NOT NULL,
	"location" text NOT NULL,
	"model" text NOT NULL,
	"endpoint" text,
	"companion_id" text,
	"credential" text,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_inference_jobs" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"connection_id" text NOT NULL,
	"companion_id" text NOT NULL,
	"project_id" text,
	"request_id" text NOT NULL,
	"state" text DEFAULT 'PENDING' NOT NULL,
	"input" jsonb,
	"output" jsonb,
	"completion_hash" text,
	"lease_hash" text,
	"lease_until" timestamp with time zone,
	"deadline" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_companions" ADD CONSTRAINT "ai_companions_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_connections" ADD CONSTRAINT "ai_connections_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_connections" ADD CONSTRAINT "ai_connections_companion_id_ai_companions_id_fk" FOREIGN KEY ("companion_id") REFERENCES "public"."ai_companions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_inference_jobs" ADD CONSTRAINT "ai_inference_jobs_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_inference_jobs" ADD CONSTRAINT "ai_inference_jobs_connection_id_ai_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."ai_connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_inference_jobs" ADD CONSTRAINT "ai_inference_jobs_companion_id_ai_companions_id_fk" FOREIGN KEY ("companion_id") REFERENCES "public"."ai_companions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_inference_jobs" ADD CONSTRAINT "ai_inference_jobs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_companions_owner_idx" ON "ai_companions" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "ai_connections_owner_idx" ON "ai_connections" USING btree ("owner_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ai_connections_default_idx" ON "ai_connections" USING btree ("owner_id") WHERE "ai_connections"."is_default";--> statement-breakpoint
CREATE INDEX "ai_inference_jobs_companion_state_idx" ON "ai_inference_jobs" USING btree ("companion_id","state");--> statement-breakpoint
CREATE INDEX "ai_inference_jobs_deadline_idx" ON "ai_inference_jobs" USING btree ("deadline");