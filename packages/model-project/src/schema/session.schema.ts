import { index, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

import { auditTimestamps, primaryTextId } from "./shared/column-builders.js";
import { user } from "./user.schema.js";

export const session = pgTable("session", {
  id: primaryTextId(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  token: text("token").notNull(),
  ...auditTimestamps(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
}, (table) => [
  uniqueIndex("session_token_unique").on(table.token),
  index("session_user_idx").on(table.userId),
]);
