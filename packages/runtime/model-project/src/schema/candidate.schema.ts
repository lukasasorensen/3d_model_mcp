import { jsonb, index, pgTable, text, type AnyPgColumn } from "drizzle-orm/pg-core";

import { candidateState } from "./candidate-state.enum.js";
import { projects } from "./project.schema.js";
import { revisions } from "./revision.schema.js";
import {
  auditTimestamps,
  diagnosticsColumn,
  optionalRendererMetadataColumn,
  primaryTextId,
  requestTraceColumns,
  sourceDocumentColumns,
  sourceIntegrityChecks,
} from "./shared/column-builders.js";

export const candidates = pgTable("candidates", {
  id: primaryTextId(),
  projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  parentRevisionId: text("parent_revision_id").references((): AnyPgColumn => revisions.id, { onDelete: "restrict" }),
  ...sourceDocumentColumns(),
  activeAttemptId: text("active_attempt_id"),
  geometry: jsonb("geometry"),
  state: candidateState("state").notNull(),
  ...requestTraceColumns(),
  validationPolicyVersion: text("validation_policy_version"),
  diagnostics: diagnosticsColumn(),
  renderer: optionalRendererMetadataColumn(),
  ...auditTimestamps(),
}, (table) => [
  index("candidates_project_state_idx").on(table.projectId, table.state),
  ...sourceIntegrityChecks("candidates", table),
]);
