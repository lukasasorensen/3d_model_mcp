import { defineTableFactory } from "./shared/tableFactory.util.js";
import { index, pgTable, text, type AnyPgColumn } from "drizzle-orm/pg-core";

import {
  auditTimestamps,
  primaryTextId,
} from "./shared/columnBuilders.util.js";
import { user } from "./user.schema.js";

export const defineProjectsSchema = defineTableFactory(
  (references: { revisions: () => AnyPgColumn }) => {
    const projects = pgTable(
      "projects",
      {
        id: primaryTextId(),
        ownerId: text("owner_id")
          .notNull()
          .references(() => user.id, { onDelete: "cascade" }),
        name: text("name").notNull().default("Untitled project"),
        description: text("description").notNull().default(""),
        currentRevisionId: text("current_revision_id").references(
          references.revisions,
          { onDelete: "restrict" },
        ),
        ...auditTimestamps(),
      },
      (table) => [
        index("projects_owner_created_idx").on(table.ownerId, table.createdAt),
      ],
    );
    return projects;
  },
);
