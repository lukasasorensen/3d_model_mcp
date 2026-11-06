import { index, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import {
  auditTimestamps,
  primaryTextId,
} from "./shared/columnBuilders.util.js";
import { user } from "./user.schema.js";
import { aiConnection } from "./aiConnection.schema.js";
import { aiCompanion } from "./aiCompanion.schema.js";
import { defineTableFactory } from "./shared/tableFactory.util.js";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
export const defineAiInferenceJobsSchema = defineTableFactory(
  (references: { projects: () => AnyPgColumn }) =>
    pgTable(
      "ai_inference_jobs",
      {
        id: primaryTextId(),
        ownerId: text("owner_id")
          .notNull()
          .references(() => user.id, { onDelete: "cascade" }),
        connectionId: text("connection_id")
          .notNull()
          .references(() => aiConnection.id, { onDelete: "cascade" }),
        companionId: text("companion_id")
          .notNull()
          .references(() => aiCompanion.id, { onDelete: "cascade" }),
        projectId: text("project_id").references(references.projects, {
          onDelete: "cascade",
        }),
        requestId: text("request_id").notNull(),
        state: text("state").notNull().default("PENDING"),
        input: jsonb("input"),
        output: jsonb("output"),
        completionHash: text("completion_hash"),
        leaseHash: text("lease_hash"),
        leaseUntil: timestamp("lease_until", { withTimezone: true }),
        deadline: timestamp("deadline", { withTimezone: true }).notNull(),
        ...auditTimestamps(),
      },
      (table) => [
        index("ai_inference_jobs_companion_state_idx").on(
          table.companionId,
          table.state,
        ),
        index("ai_inference_jobs_deadline_idx").on(table.deadline),
      ],
    ),
);
