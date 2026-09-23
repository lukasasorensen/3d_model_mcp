import { pgTable, text, timestamp, integer, jsonb, index } from "drizzle-orm/pg-core";
import { projects } from "./project.schema.js";
import { user } from "./user.schema.js";
import { primaryTextId, auditTimestamps } from "./shared/column-builders.js";
export const modelExports = pgTable("model_exports", {
    id: primaryTextId(), ownerId: text("owner_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
    revisionId: text("revision_id").notNull(), sourceHash: text("source_hash").notNull(), format: text("format").notNull(),
    mode: text("mode").notNull(), state: text("state").notNull(), reservedBytes: integer("reserved_bytes").notNull(),
    sessionId: text("session_id"), tokenHash: text("token_hash"), metadata: jsonb("metadata"),
    deadline: timestamp("deadline", { withTimezone: true }).notNull(), expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(), ...auditTimestamps(),
}, (table) => [index("model_exports_owner_idx").on(table.ownerId, table.projectId)]);
