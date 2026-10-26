import { pgTable, text, timestamp, jsonb, index, uniqueIndex } from "drizzle-orm/pg-core";
import { user } from "./user.schema.js";
import { projects } from "./project.schema.js";
import { workerExportState } from "./worker-export-state.enum.js";
import { primaryTextId, auditTimestamps } from "./shared/column-builders.js";

export const workerExportJobs = pgTable("worker_export_jobs", {
  id: primaryTextId(), ownerId: text("owner_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  // Retained terminal evidence must survive artifact cleanup; export_id deliberately has no artifact FK.
  exportId: text("export_id").notNull(), revisionId: text("revision_id").notNull(), sourceHash: text("source_hash").notNull(),
  format: text("format").notNull(), tokenHash: text("token_hash").notNull(),
  state: workerExportState("state").notNull().default("PENDING"),
  deadline: timestamp("deadline", { withTimezone: true }).notNull(),
  retainUntil: timestamp("retain_until", { withTimezone: true }).notNull(),
  completionHash: text("completion_hash"), completion: jsonb("completion"), ...auditTimestamps(),
}, table => [uniqueIndex("worker_export_jobs_export_idx").on(table.exportId),
  index("worker_export_jobs_owner_state_idx").on(table.ownerId, table.state), index("worker_export_jobs_retention_idx").on(table.retainUntil)]);
