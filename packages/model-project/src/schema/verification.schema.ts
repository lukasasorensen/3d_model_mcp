import { index, pgTable, text, timestamp } from "drizzle-orm/pg-core";

import { auditTimestamps, primaryTextId } from "./shared/column-builders.js";

export const verification = pgTable("verification", {
  id: primaryTextId(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  ...auditTimestamps(),
}, (table) => [index("verification_identifier_idx").on(table.identifier)]);
