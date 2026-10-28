import { defineTableFactory } from "./shared/tableFactory.util.js";
import {
  index,
  jsonb,
  pgTable,
  text,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";

import { candidateState } from "./candidateState.enum.js";

import {
  auditTimestamps,
  diagnosticsColumn,
  optionalRendererMetadataColumn,
  primaryTextId,
  requestTraceColumns,
  sourceDocumentColumns,
  sourceIntegrityChecks,
} from "./shared/columnBuilders.util.js";

export const defineCandidatesSchema = defineTableFactory(
  (references: {
    projects: () => AnyPgColumn;
    revisions: () => AnyPgColumn;
  }) => {
    const candidates = pgTable(
      "candidates",
      {
        id: primaryTextId(),
        projectId: text("project_id")
          .notNull()
          .references(references.projects, { onDelete: "cascade" }),
        parentRevisionId: text("parent_revision_id").references(
          references.revisions,
          { onDelete: "restrict" },
        ),
        ...sourceDocumentColumns(),
        activeAttemptId: text("active_attempt_id"),
        geometry: jsonb("geometry"),
        state: candidateState("state").notNull(),
        ...requestTraceColumns(),
        validationPolicyVersion: text("validation_policy_version"),
        diagnostics: diagnosticsColumn(),
        renderer: optionalRendererMetadataColumn(),
        ...auditTimestamps(),
      },
      (table) => [
        index("candidates_project_state_idx").on(table.projectId, table.state),
        ...sourceIntegrityChecks("candidates", table),
      ],
    );
    return candidates;
  },
);
