import { index, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { oauthClient } from "./oauth-client.schema.js";
import { session } from "./session.schema.js";
import { user } from "./user.schema.js";
import { oauthRefreshToken } from "./oauth-refresh-token.schema.js";

export const oauthAccessToken = pgTable("oauth_access_token", {
  id: text("id").primaryKey(),
  token: text("token").notNull().unique(),
  clientId: text("client_id").notNull().references(() => oauthClient.clientId, { onDelete: "cascade" }),
  sessionId: text("session_id").references(() => session.id, { onDelete: "set null" }),
  userId: text("user_id").references(() => user.id, { onDelete: "cascade" }),
  referenceId: text("reference_id"),
  authorizationCodeId: text("authorization_code_id"),
  resources: text("resources").array(),
  requestedUserInfoClaims: text("requested_user_info_claims").array(),
  refreshId: text("refresh_id").references(() => oauthRefreshToken.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  revoked: timestamp("revoked", { withTimezone: true }),
  confirmation: jsonb("confirmation"),
  scopes: text("scopes").array().notNull(),
}, (table) => [
  index("oauth_access_token_client_id_idx").on(table.clientId),
  index("oauth_access_token_session_id_idx").on(table.sessionId),
  index("oauth_access_token_user_id_idx").on(table.userId),
  index("oauth_access_token_authorization_code_id_idx").on(table.authorizationCodeId),
  index("oauth_access_token_refresh_id_idx").on(table.refreshId),
]);
