import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

export function defineExportDownloadTokensSchema(references: {
  modelExports: () => AnyPgColumn;
}) {
  const exportDownloadTokens = pgTable("export_download_tokens", {
    hash: text("hash").primaryKey(),
    exportId: text("export_id")
      .notNull()
      .references(references.modelExports, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  });
  return exportDownloadTokens;
}
