import { index, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

import { auditTimestamps, primaryTextId } from "./shared/column-builders.js";
import { user } from "./user.schema.js";

export const account = pgTable("account", {
  id: primaryTextId(),
  issuer: text("issuer").notNull(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
  scope: text("scope"),
  password: text("password"),
  ...auditTimestamps(),
}, (table) => [
  index("account_user_idx").on(table.userId),
  uniqueIndex("account_issuer_id_unique").on(table.issuer, table.accountId),
]);
