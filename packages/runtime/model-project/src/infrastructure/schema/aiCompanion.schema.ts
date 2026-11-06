import { pgTable, text, timestamp, index } from "drizzle-orm/pg-core";
import {
  auditTimestamps,
  primaryTextId,
} from "./shared/columnBuilders.util.js";
import { user } from "./user.schema.js";
export const aiCompanion = pgTable(
  "ai_companions",
  {
    id: primaryTextId(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    provider: text("provider").notNull(),
    secretHash: text("secret_hash").notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    ...auditTimestamps(),
  },
  (table) => [index("ai_companions_owner_idx").on(table.ownerId)],
);
