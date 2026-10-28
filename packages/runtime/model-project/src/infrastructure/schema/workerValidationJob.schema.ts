import { defineTableFactory } from "./shared/tableFactory.util.js";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import {
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

import { renderJobState } from "./renderJobState.enum.js";
import {
  auditTimestamps,
  primaryTextId,
} from "./shared/columnBuilders.util.js";
import { user } from "./user.schema.js";

export const defineWorkerValidationJobsSchema = defineTableFactory(
  (references: {
    candidates: () => AnyPgColumn;
    projects: () => AnyPgColumn;
    validationAttempts: () => AnyPgColumn;
  }) => {
    const workerValidationJobs = pgTable(
      "worker_validation_jobs",
      {
        id: primaryTextId(),
        ownerId: text("owner_id")
          .notNull()
          .references(() => user.id, { onDelete: "cascade" }),
        projectId: text("project_id")
          .notNull()
          .references(references.projects, { onDelete: "cascade" }),
        candidateId: text("candidate_id")
          .notNull()
          .references(references.candidates, { onDelete: "cascade" }),
        attemptId: text("attempt_id")
          .notNull()
          .references(references.validationAttempts, { onDelete: "cascade" }),
        sourceHash: text("source_hash").notNull(),
        tokenHash: text("token_hash").notNull(),
        state: renderJobState("state").notNull().default("PENDING"),
        deadline: timestamp("deadline", { withTimezone: true }).notNull(),
        completionHash: text("completion_hash"),
        completion: jsonb("completion"),
        ...auditTimestamps(),
      },
      (table) => [
        uniqueIndex("worker_validation_jobs_attempt_idx").on(table.attemptId),
        index("worker_validation_jobs_owner_state_idx").on(
          table.ownerId,
          table.state,
        ),
      ],
    );
    return workerValidationJobs;
  },
);
