import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { index, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";

import { renderDeliveryMode } from "./renderDeliveryMode.enum.js";
import { renderJobState } from "./renderJobState.enum.js";
import {
  auditTimestamps,
  primaryTextId,
} from "./shared/columnBuilders.util.js";
import { user } from "./user.schema.js";

export function defineBrowserRenderJobsSchema(references: {
  projects: () => AnyPgColumn;
}) {
  const browserRenderJobs = pgTable(
    "browser_render_jobs",
    {
      id: primaryTextId(),
      ownerId: text("owner_id")
        .notNull()
        .references(() => user.id, { onDelete: "cascade" }),
      projectId: text("project_id")
        .notNull()
        .references(references.projects, { onDelete: "cascade" }),
      candidateId: text("candidate_id").notNull(),
      sessionId: text("session_id"),
      tokenHash: text("token_hash"),
      sourceHash: text("source_hash").notNull(),
      state: renderJobState("state").notNull().default("PENDING"),
      deliveryMode: renderDeliveryMode("delivery_mode")
        .notNull()
        .default("chat"),
      claimDeadline: timestamp("claim_deadline", { withTimezone: true }),
      claimedAt: timestamp("claimed_at", { withTimezone: true }),
      completion: jsonb("completion"),
      deadline: timestamp("deadline", { withTimezone: true }).notNull(),
      ...auditTimestamps(),
    },
    (table) => [
      index("browser_render_jobs_pending_idx").on(table.state, table.deadline),
      index("browser_render_jobs_claim_idx").on(
        table.ownerId,
        table.projectId,
        table.deliveryMode,
        table.state,
      ),
    ],
  );
  return browserRenderJobs;
}
