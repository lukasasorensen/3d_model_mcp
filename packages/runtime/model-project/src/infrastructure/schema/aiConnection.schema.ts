import {
  boolean,
  index,
  pgTable,
  text,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import {
  auditTimestamps,
  primaryTextId,
} from "./shared/columnBuilders.util.js";
import { user } from "./user.schema.js";
import { aiCompanion } from "./aiCompanion.schema.js";
export const aiConnection = pgTable(
  "ai_connections",
  {
    id: primaryTextId(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    provider: text("provider").notNull(),
    location: text("location").notNull(),
    model: text("model").notNull(),
    endpoint: text("endpoint"),
    companionId: text("companion_id").references(() => aiCompanion.id, {
      onDelete: "cascade",
    }),
    credential: text("credential"),
    isDefault: boolean("is_default").notNull().default(false),
    ...auditTimestamps(),
  },
  (table) => [
    index("ai_connections_owner_idx").on(table.ownerId),
    uniqueIndex("ai_connections_default_idx")
      .on(table.ownerId)
      .where(sql`${table.isDefault}`),
  ],
);
