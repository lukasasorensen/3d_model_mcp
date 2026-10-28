import { defineTableFactory } from "./shared/tableFactory.util.js";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { pgTable, primaryKey, text } from "drizzle-orm/pg-core";

import {
  artifactColumns,
  artifactFormatCheck,
} from "./shared/columnBuilders.util.js";

export const defineRevisionArtifactsSchema = defineTableFactory(
  (references: { revisions: () => AnyPgColumn }) => {
    const revisionArtifacts = pgTable(
      "revision_artifacts",
      {
        revisionId: text("revision_id")
          .notNull()
          .references(references.revisions, { onDelete: "cascade" }),
        ...artifactColumns(),
      },
      (table) => [
        primaryKey({ columns: [table.revisionId, table.format] }),
        artifactFormatCheck("revision_artifact", table.format),
      ],
    );
    return revisionArtifacts;
  },
);
