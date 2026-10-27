import { sql } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import {
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

import { renderDeliveryMode } from "./renderDeliveryMode.enum.js";
import { renderJobState } from "./renderJobState.enum.js";
import {
  auditTimestamps,
  primaryTextId,
} from "./shared/columnBuilders.util.js";
import { user } from "./user.schema.js";

export function defineBrowserPreviewJobsSchema(references: {
  projects: () => AnyPgColumn;
}) {
  const browserPreviewJobs = pgTable(
    "browser_preview_jobs",
    {
      id: primaryTextId(),
      ownerId: text("owner_id")
        .notNull()
        .references(() => user.id, { onDelete: "cascade" }),
      projectId: text("project_id")
        .notNull()
        .references(references.projects, { onDelete: "cascade" }),
      metadata: jsonb("metadata").notNull(),
      source: text("source").notNull(),
      deliveryMode: renderDeliveryMode("delivery_mode").notNull(),
      state: renderJobState("state").notNull().default("PENDING"),
      sessionId: text("session_id"),
      tokenHash: text("token_hash"),
      claimedAt: timestamp("claimed_at", { withTimezone: true }),
      claimDeadline: timestamp("claim_deadline", {
        withTimezone: true,
      }).notNull(),
      deadline: timestamp("deadline", { withTimezone: true }).notNull(),
      completion: jsonb("completion"),
      ...auditTimestamps(),
    },
    (table) => [
      uniqueIndex("browser_preview_jobs_active_idx")
        .on(table.ownerId, table.projectId)
        .where(sql`${table.state} = 'PENDING'`),
    ],
  );
  return browserPreviewJobs;
}
