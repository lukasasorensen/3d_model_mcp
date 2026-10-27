import type { AnyPgColumn } from "drizzle-orm/pg-core";
import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

import {
  auditTimestamps,
  primaryTextId,
} from "./shared/columnBuilders.util.js";
import { user } from "./user.schema.js";
export function defineModelExportsSchema(references: {
  projects: () => AnyPgColumn;
}) {
  const modelExports = pgTable(
    "model_exports",
    {
      id: primaryTextId(),
      ownerId: text("owner_id")
        .notNull()
        .references(() => user.id, { onDelete: "cascade" }),
      projectId: text("project_id")
        .notNull()
        .references(references.projects, { onDelete: "cascade" }),
      revisionId: text("revision_id").notNull(),
      sourceHash: text("source_hash").notNull(),
      format: text("format").notNull(),
      mode: text("mode").notNull(),
      state: text("state").notNull(),
      reservedBytes: integer("reserved_bytes").notNull(),
      sessionId: text("session_id"),
      tokenHash: text("token_hash"),
      metadata: jsonb("metadata"),
      deadline: timestamp("deadline", { withTimezone: true }).notNull(),
      expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
      ...auditTimestamps(),
    },
    (table) => [
      index("model_exports_owner_idx").on(table.ownerId, table.projectId),
    ],
  );
  return modelExports;
}
