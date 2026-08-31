import { index, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { oauthClient } from "./oauth-client.schema.js";
import { user } from "./user.schema.js";

export const oauthConsent = pgTable("oauth_consent", {
  id: text("id").primaryKey(),
  clientId: text("client_id").notNull().references(() => oauthClient.clientId, { onDelete: "cascade" }),
  userId: text("user_id").references(() => user.id, { onDelete: "cascade" }),
  referenceId: text("reference_id"),
  resources: text("resources").array(),
  requestedUserInfoClaims: text("requested_user_info_claims").array(),
  scopes: text("scopes").array().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
}, (table) => [
  index("oauth_consent_client_id_idx").on(table.clientId),
  index("oauth_consent_user_id_idx").on(table.userId),
]);
