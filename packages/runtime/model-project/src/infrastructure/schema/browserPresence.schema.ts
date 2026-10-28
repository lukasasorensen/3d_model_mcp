import { defineTableFactory } from "./shared/tableFactory.util.js";
import { sql } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import {
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

import { user } from "./user.schema.js";
export const defineBrowserPresenceSchema = defineTableFactory(
  (references: { projects: () => AnyPgColumn }) => {
    const browserPresence = pgTable(
      "browser_presence",
      {
        ownerId: text("owner_id")
          .notNull()
          .references(() => user.id, { onDelete: "cascade" }),
        projectId: text("project_id")
          .notNull()
          .references(references.projects, { onDelete: "cascade" }),
        tabId: text("tab_id")
          .notNull()
          .default(sql`gen_random_uuid()::text`),
        sessionId: text("session_id").notNull(),
        status: jsonb("status").notNull(),
        updatedAt: timestamp("updated_at", { withTimezone: true })
          .notNull()
          .defaultNow(),
      },
      (table) => [
        primaryKey({ columns: [table.ownerId, table.projectId, table.tabId] }),
      ],
    );
    return browserPresence;
  },
);
