import { defineTableFactory } from "./shared/tableFactory.util.js";
import {
  index,
  jsonb,
  pgTable,
  text,
  uniqueIndex,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";

import {
  creationTimestamp,
  diagnosticsColumn,
  primaryTextId,
  requestTraceColumns,
  requiredRendererMetadataColumn,
  sourceDocumentColumns,
  sourceIntegrityChecks,
} from "./shared/columnBuilders.util.js";

export const defineRevisionsSchema = defineTableFactory(
  (references: { projects: () => AnyPgColumn }) => {
    const revisions = pgTable(
      "revisions",
      {
        id: primaryTextId(),
        geometry: jsonb("geometry"),
        projectId: text("project_id")
          .notNull()
          .references(references.projects, { onDelete: "cascade" }),
        parentRevisionId: text("parent_revision_id").references(
          (): AnyPgColumn => revisions.id,
          { onDelete: "restrict" },
        ),
        restoredFromRevisionId: text("restored_from_revision_id").references(
          (): AnyPgColumn => revisions.id,
          { onDelete: "restrict" },
        ),
        ...sourceDocumentColumns(),
        ...requestTraceColumns(),
        candidateId: text("candidate_id").notNull(),
        validationPolicyVersion: text("validation_policy_version").notNull(),
        diagnostics: diagnosticsColumn(),
        renderer: requiredRendererMetadataColumn(),
        createdAt: creationTimestamp(),
      },
      (table) => [
        index("revisions_project_created_idx").on(
          table.projectId,
          table.createdAt,
        ),
        uniqueIndex("revisions_project_id_unique").on(
          table.projectId,
          table.id,
        ),
        ...sourceIntegrityChecks("revisions", table),
      ],
    );
    return revisions;
  },
);
