import {
  exportModelInputSchema,
  getProjectStateInputSchema,
  listRevisionsInputSchema,
  promoteCandidateInputSchema,
  proposeModelSourceInputSchema,
  readModelSourceInputSchema,
  restoreRevisionInputSchema,
  validateAndRenderInputSchema,
} from "@theoryfoundry/contracts";
import type { CadToolName } from "@theoryfoundry/mcp";
import type * as z from "zod/v4";

export const CAD_TOOL_NAMES = [
  "create_project",
  "update_project",
  "get_project_state",
  "read_model_source",
  "propose_model_source",
  "validate_and_render",
  "promote_candidate",
  "export_model",
  "list_revisions",
  "restore_revision",
] as const satisfies readonly CadToolName[];

export const toolSpecs = [
  {
    name: "get_project_state",
    description: "Inspect authoritative current CAD state.",
    schema: getProjectStateInputSchema,
  },
  {
    name: "read_model_source",
    description: "Read canonical source for a revision.",
    schema: readModelSourceInputSchema,
  },
  {
    name: "propose_model_source",
    description: "Propose bounded OpenSCAD source against a parent revision.",
    schema: proposeModelSourceInputSchema.omit({
      requestId: true,
      toolCallId: true,
    }),
  },
  {
    name: "validate_and_render",
    description: "Validate and render a candidate using the standard profile.",
    schema: validateAndRenderInputSchema,
  },
  {
    name: "promote_candidate",
    description: "Atomically promote a valid candidate.",
    schema: promoteCandidateInputSchema,
  },
  {
    name: "export_model",
    description:
      "Generate or reuse a verifiable STL/3MF download receipt for the current revision.",
    schema: exportModelInputSchema,
  },
  {
    name: "list_revisions",
    description: "List authoritative revision history.",
    schema: listRevisionsInputSchema,
  },
  {
    name: "restore_revision",
    description: "Restore a historical revision as a new current child.",
    schema: restoreRevisionInputSchema.omit({
      requestId: true,
      toolCallId: true,
    }),
  },
] as const satisfies ReadonlyArray<{
  name: CadToolName;
  description: string;
  schema: z.ZodType;
}>;
