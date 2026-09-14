import { index, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { oauthClient } from "./oauth-client.schema.js";
import { session } from "./session.schema.js";
import { user } from "./user.schema.js";

export const oauthRefreshToken = pgTable("oauth_refresh_token", {
  id: text("id").primaryKey(),
  token: text("token").notNull().unique(),
  clientId: text("client_id").notNull().references(() => oauthClient.clientId, { onDelete: "cascade" }),
  sessionId: text("session_id").references(() => session.id, { onDelete: "set null" }),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  referenceId: text("reference_id"),
  authorizationCodeId: text("authorization_code_id"),
  resources: text("resources").array(),
  requestedUserInfoClaims: text("requested_user_info_claims").array(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  revoked: timestamp("revoked", { withTimezone: true }),
  rotatedAt: timestamp("rotated_at", { withTimezone: true }),
  rotationReplayResponse: text("rotation_replay_response"),
  rotationReplayExpiresAt: timestamp("rotation_replay_expires_at", { withTimezone: true }),
  authTime: timestamp("auth_time", { withTimezone: true }),
  confirmation: jsonb("confirmation"),
  scopes: text("scopes").array().notNull(),
}, (table) => [
  index("oauth_refresh_token_client_id_idx").on(table.clientId),
  index("oauth_refresh_token_session_id_idx").on(table.sessionId),
  index("oauth_refresh_token_user_id_idx").on(table.userId),
  index("oauth_refresh_token_authorization_code_id_idx").on(table.authorizationCodeId),
]);
