import { sql } from "drizzle-orm";
import { pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import {
  creationTimestamp,
  primaryTextId,
} from "./shared/columnBuilders.util.js";
import { user } from "./user.schema.js";

export const platformInvitation = pgTable(
  "platform_invitation",
  {
    id: primaryTextId(),
    email: text("email").notNull(),
    createdBy: text("created_by")
      .notNull()
      .references(() => user.id),
    createdAt: creationTimestamp(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    tokenDigest: text("token_digest").notNull().unique(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("platform_invitation_open_email")
      .on(table.email)
      .where(sql`${table.revokedAt} is null and ${table.acceptedAt} is null`),
  ],
);
