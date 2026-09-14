import { boolean, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core";

import { auditTimestamps, primaryTextId } from "./shared/column-builders.js";

// Property names intentionally match the Better Auth Drizzle adapter.
export const user = pgTable("user", {
  id: primaryTextId(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  ...auditTimestamps(),
}, (table) => [uniqueIndex("user_email_unique").on(table.email)]);
