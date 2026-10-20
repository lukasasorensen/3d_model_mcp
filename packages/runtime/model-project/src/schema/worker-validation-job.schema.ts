import { pgTable, text, timestamp, jsonb, index, uniqueIndex } from "drizzle-orm/pg-core";
import { user } from "./user.schema.js";
import { projects } from "./project.schema.js";
import { candidates } from "./candidate.schema.js";
import { validationAttempts } from "./validation-attempt.schema.js";
import { renderJobState } from "./render-job-state.enum.js";
import { primaryTextId, auditTimestamps } from "./shared/column-builders.js";

export const workerValidationJobs = pgTable("worker_validation_jobs", {
  id: primaryTextId(), ownerId: text("owner_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  candidateId: text("candidate_id").notNull().references(() => candidates.id, { onDelete: "cascade" }),
  attemptId: text("attempt_id").notNull().references(() => validationAttempts.id, { onDelete: "cascade" }),
  sourceHash: text("source_hash").notNull(), tokenHash: text("token_hash").notNull(),
  state: renderJobState("state").notNull().default("PENDING"), deadline: timestamp("deadline", { withTimezone: true }).notNull(),
  completionHash: text("completion_hash"), completion: jsonb("completion"), ...auditTimestamps(),
}, table => [uniqueIndex("worker_validation_jobs_attempt_idx").on(table.attemptId), index("worker_validation_jobs_owner_state_idx").on(table.ownerId, table.state)]);
