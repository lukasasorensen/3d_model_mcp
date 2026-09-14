import { index, pgTable, text, type AnyPgColumn } from "drizzle-orm/pg-core";

import { revisions } from "./revision.schema.js";
import { auditTimestamps, primaryTextId } from "./shared/column-builders.js";
import { user } from "./user.schema.js";

export const projects = pgTable("projects", {
  id: primaryTextId(),
  ownerId: text("owner_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  name: text("name").notNull().default("Untitled project"),
  description: text("description").notNull().default(""),
  currentRevisionId: text("current_revision_id").references((): AnyPgColumn => revisions.id, { onDelete: "restrict" }),
  ...auditTimestamps(),
}, (table) => [index("projects_owner_created_idx").on(table.ownerId, table.createdAt)]);
