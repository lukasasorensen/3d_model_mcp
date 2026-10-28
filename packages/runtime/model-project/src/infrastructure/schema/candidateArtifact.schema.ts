import { defineTableFactory } from "./shared/tableFactory.util.js";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { pgTable, primaryKey, text } from "drizzle-orm/pg-core";

import {
  artifactColumns,
  artifactFormatCheck,
} from "./shared/columnBuilders.util.js";

export const defineCandidateArtifactsSchema = defineTableFactory(
  (references: { candidates: () => AnyPgColumn }) => {
    const candidateArtifacts = pgTable(
      "candidate_artifacts",
      {
        candidateId: text("candidate_id")
          .notNull()
          .references(references.candidates, { onDelete: "cascade" }),
        ...artifactColumns(),
      },
      (table) => [
        primaryKey({ columns: [table.candidateId, table.format] }),
        artifactFormatCheck("candidate_artifact", table.format),
      ],
    );
    return candidateArtifacts;
  },
);
