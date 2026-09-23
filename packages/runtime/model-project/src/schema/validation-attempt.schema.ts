import { pgTable, text, timestamp, jsonb } from "drizzle-orm/pg-core";
import { candidates } from "./candidate.schema.js";
import { primaryTextId, auditTimestamps } from "./shared/column-builders.js";
export const validationAttempts = pgTable("validation_attempts", {
    id: primaryTextId(), candidateId: text("candidate_id").notNull().references(() => candidates.id, { onDelete: "cascade" }),
    state: text("state").notNull(), error: jsonb("error"), deadline: timestamp("deadline", { withTimezone: true }).notNull(), ...auditTimestamps(),
});
