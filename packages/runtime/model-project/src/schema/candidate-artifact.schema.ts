import { pgTable, primaryKey, text } from "drizzle-orm/pg-core";

import { candidates } from "./candidate.schema.js";
import { artifactColumns, artifactFormatCheck } from "./shared/column-builders.js";

export const candidateArtifacts = pgTable("candidate_artifacts", {
  candidateId: text("candidate_id").notNull().references(() => candidates.id, { onDelete: "cascade" }),
  ...artifactColumns(),
}, (table) => [
  primaryKey({ columns: [table.candidateId, table.format] }),
  artifactFormatCheck("candidate_artifact", table.format),
]);
