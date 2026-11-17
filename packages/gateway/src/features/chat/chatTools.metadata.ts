import {
  modelFileEditContentSchema,
  listModelFilesInputSchema,
  readModelFileInputSchema,
  readModelObjectInputSchema,
  createCadToolCatalog,
  parameterEditContentSchema,
  listModelParametersInputSchema,
  exportModelInputSchema,
  getProjectStateInputSchema,
  listRevisionsInputSchema,
  promoteCandidateInputSchema,
  modelProposalContentSchema,
  readModelSourceInputSchema,
  restoreRevisionInputSchema,
  validateAndRenderInputSchema,
} from "@theoryfoundry/contracts";
import type { CadToolName } from "@theoryfoundry/mcp";
import type * as z from "zod/v4";

export const CAD_TOOL_NAMES = [
  "list_projects",
  "create_project",
  "update_project",
  "get_project_state",
  "read_model_source",
  "list_model_parameters",
  "edit_parameters",
  "list_model_files",
  "list_model_objects",
  "read_model_file",
  "read_model_object",
  "edit_model_files",
  "propose_model_source",
  "validate_and_render",
  "promote_candidate",
  "export_model",
  "list_revisions",
  "restore_revision",
] as const satisfies readonly CadToolName[];

const catalog = createCadToolCatalog();
export const toolSpecs = [
  {
    name: "list_model_files",
    description: catalog.list_model_files.description,
    schema: listModelFilesInputSchema,
  },
  {
    name: "list_model_objects",
    description: catalog.list_model_objects.description,
    schema: listModelFilesInputSchema,
  },
  {
    name: "read_model_file",
    description: catalog.read_model_file.description,
    schema: readModelFileInputSchema,
  },
  {
    name: "read_model_object",
    description: catalog.read_model_object.description,
    schema: readModelObjectInputSchema,
  },
  {
    name: "edit_model_files",
    description: catalog.edit_model_files.description,
    schema: modelFileEditContentSchema,
  },

  {
    name: "list_model_parameters",
    description:
      "List complete parameter definitions and current/default values with their revision. Read the body separately with read_model_source.",
    schema: listModelParametersInputSchema,
  },
  {
    name: "edit_parameters",
    description:
      "Create a candidate using batched create/update (complete definition), set_value (ID/value), or delete (ID) operations, each ID once. Use the exact parent. Omitted modelBody preserves the named parent's generated body or complete file snapshot. Genesis/legacy adoption needs an explicit body; coordinate body edits for rename/deletion. Validate and promote separately; never edit generated headers.",
    schema: parameterEditContentSchema,
  },
  {
    name: "get_project_state",
    description: "Inspect authoritative current CAD state.",
    schema: getProjectStateInputSchema,
  },
  {
    name: "read_model_source",
    description:
      "Read modelFiles snapshots for multi-file documents, editable modelBody plus parameters for generated documents, or legacy source, at a revision. sourceHash identifies assembled render source.",
    schema: readModelSourceInputSchema,
  },
  {
    name: "propose_model_source",
    description:
      "Propose against the exact parent. Supply modelBody plus structured parameters for a generated read-only header, or legacy source for an unparameterized model. Supply exactly one of source/modelBody/modelFiles; omitted parameters inherit the named parent, [] removes declarations. Never edit generated literals; coordinate body changes for removal/rename.",
    schema: modelProposalContentSchema,
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
