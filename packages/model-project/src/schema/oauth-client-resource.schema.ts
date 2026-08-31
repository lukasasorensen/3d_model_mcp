import { index, jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { oauthClient } from "./oauth-client.schema.js";
import { oauthResource } from "./oauth-resource.schema.js";

export const oauthClientResource = pgTable("oauth_client_resource", {
  id: text("id").primaryKey(),
  clientId: text("client_id").notNull().references(() => oauthClient.clientId, { onDelete: "cascade" }),
  resourceId: text("resource_id").notNull().references(() => oauthResource.identifier, { onDelete: "cascade" }),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at", { withTimezone: true }),
}, (table) => [
  index("oauth_client_resource_client_id_idx").on(table.clientId),
  index("oauth_client_resource_resource_id_idx").on(table.resourceId),
  uniqueIndex("oauth_client_resource_client_id_resource_id_unique").on(table.clientId, table.resourceId),
]);
