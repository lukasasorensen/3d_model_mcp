import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { modelExports } from "./model-export.schema.js";
export const exportDownloadTokens = pgTable("export_download_tokens", {
    hash: text("hash").primaryKey(), exportId: text("export_id").notNull().references(() => modelExports.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});
