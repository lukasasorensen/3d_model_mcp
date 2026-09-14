import { sql } from "drizzle-orm";
import { pgTable, text, jsonb, timestamp, primaryKey } from "drizzle-orm/pg-core";
import { projects } from "./project.schema.js";
import { user } from "./user.schema.js";
export const browserPresence = pgTable("browser_presence", {
  ownerId: text("owner_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  tabId: text("tab_id").notNull().default(sql`gen_random_uuid()::text`),
  sessionId: text("session_id").notNull(), status: jsonb("status").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [primaryKey({ columns: [table.ownerId, table.projectId, table.tabId] })]);
