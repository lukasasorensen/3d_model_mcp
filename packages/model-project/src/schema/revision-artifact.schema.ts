import { pgTable, primaryKey, text } from "drizzle-orm/pg-core";

import { revisions } from "./revision.schema.js";
import { artifactColumns, artifactFormatCheck } from "./shared/column-builders.js";

export const revisionArtifacts = pgTable("revision_artifacts", {
  revisionId: text("revision_id").notNull().references(() => revisions.id, { onDelete: "cascade" }),
  ...artifactColumns(),
}, (table) => [
  primaryKey({ columns: [table.revisionId, table.format] }),
  artifactFormatCheck("revision_artifact", table.format),
]);
