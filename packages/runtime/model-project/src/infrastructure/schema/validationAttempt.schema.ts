import { defineTableFactory } from "./shared/tableFactory.util.js";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";

import {
  auditTimestamps,
  primaryTextId,
} from "./shared/columnBuilders.util.js";
export const defineValidationAttemptsSchema = defineTableFactory(
  (references: { candidates: () => AnyPgColumn }) => {
    const validationAttempts = pgTable("validation_attempts", {
      id: primaryTextId(),
      candidateId: text("candidate_id")
        .notNull()
        .references(references.candidates, { onDelete: "cascade" }),
      state: text("state").notNull(),
      error: jsonb("error"),
      deadline: timestamp("deadline", { withTimezone: true }).notNull(),
      ...auditTimestamps(),
    });
    return validationAttempts;
  },
);
