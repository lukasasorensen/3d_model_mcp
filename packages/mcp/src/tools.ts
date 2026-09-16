import {
  CAD_LIMITS,
  createProjectInputSchema,
  createProjectOutputSchema,
  updateProjectInputSchema,
  updateProjectOutputSchema,
  exportModelInputSchema,
  exportModelOutputSchema,
  getProjectStateInputSchema,
  getProjectStateOutputSchema,
  listRevisionsInputSchema,
  listRevisionsOutputSchema,
  promoteCandidateInputSchema,
  promoteCandidateOutputSchema,
  proposeModelSourceInputSchema,
  proposeModelSourceOutputSchema,
  readModelSourceInputSchema,
  readModelSourceOutputSchema,
  restoreRevisionInputSchema,
  restoreRevisionOutputSchema,
  validateAndRenderInputSchema,
  validateAndRenderOutputSchema,
} from "@rjls/contracts";
import { CadDomainError, type ModelProjectStore } from "@rjls/model-project";
import type * as z from "zod/v4";

export type CadToolName =
  | "create_project"
  | "update_project"
  | "get_project_state"
  | "read_model_source"
  | "propose_model_source"
  | "validate_and_render"
  | "promote_candidate"
  | "export_model"
  | "list_revisions"
  | "restore_revision";

export interface CadToolContext {
  signal?: AbortSignal;
}

export interface CadToolDefinition<TSchema extends z.ZodType = z.ZodType> {
  title: string;
  description: string;
  inputSchema: TSchema;
  outputSchema: z.ZodType;
  readOnly: boolean;
  execute(input: z.infer<TSchema>, context: CadToolContext): Promise<Record<string, unknown>>;
}

export type CadToolRegistry = Record<CadToolName, CadToolDefinition>;

function boundedResult(value: Record<string, unknown>): Record<string, unknown> {
  const serialized = JSON.stringify(value);
  if (Buffer.byteLength(serialized) > CAD_LIMITS.toolResultBytes) {
    throw new CadDomainError("ARTIFACT_LIMIT_EXCEEDED", "Tool result exceeds the configured response limit.");
  }
  return value;
}

export function createCadToolRegistry(repository: ModelProjectStore): CadToolRegistry {
  return {
    create_project: {
      title: "Create project",
      description: "Create a project for the authenticated owner with a name and description. Returns its project ID for subsequent CAD tools.",
      inputSchema: createProjectInputSchema,
      outputSchema: createProjectOutputSchema,
      readOnly: false,
      execute: async (raw) => boundedResult({ project: await repository.createProject(createProjectInputSchema.parse(raw)) }),
    },
    update_project: {
      title: "Update project details",
      description: "Update a project's name or description. Omitted fields are preserved; the description must remain nonempty.",
      inputSchema: updateProjectInputSchema,
      outputSchema: updateProjectOutputSchema,
      readOnly: false,
      execute: async (raw) => boundedResult({ project: await repository.updateProject(updateProjectInputSchema.parse(raw)) }),
    },
    get_project_state: {
      title: "Get project state",
      description: "Inspect the authoritative current CAD revision and its validated artifact metadata.",
      inputSchema: getProjectStateInputSchema,
      outputSchema: getProjectStateOutputSchema,
      readOnly: true,
      execute: async (raw) => {
        const input = getProjectStateInputSchema.parse(raw);
        return boundedResult({ state: await repository.getProjectState(input.projectId) });
      },
    },
    read_model_source: {
      title: "Read model source",
      description: "Read canonical OpenSCAD source for the current or a historical opaque revision ID.",
      inputSchema: readModelSourceInputSchema,
      outputSchema: readModelSourceOutputSchema,
      readOnly: true,
      execute: async (raw) => {
        const input = readModelSourceInputSchema.parse(raw);
        return boundedResult({ model: await repository.readModelSource(input.projectId, input.revision) });
      },
    },
    propose_model_source: {
      title: "Propose model source",
      description: "Create an immutable candidate from bounded OpenSCAD source against an explicit current parent (null only for genesis).",
      inputSchema: proposeModelSourceInputSchema,
      outputSchema: proposeModelSourceOutputSchema,
      readOnly: false,
      execute: async (raw) => boundedResult({ candidate: await repository.proposeModelSource(proposeModelSourceInputSchema.parse(raw)) }),
    },
    validate_and_render: {
      title: "Validate and render candidate",
      description: "Request validation and preview rendering through the server-owned standard profile.",
      inputSchema: validateAndRenderInputSchema,
      outputSchema: validateAndRenderOutputSchema,
      readOnly: false,
      execute: async (raw, context) => {
        const input = validateAndRenderInputSchema.parse(raw);
        return boundedResult({ candidate: await repository.validateAndRender({ ...input, signal: context.signal }) });
      },
    },
    promote_candidate: {
      title: "Promote candidate",
      description: "Atomically promote one validated candidate if its expected parent is still current.",
      inputSchema: promoteCandidateInputSchema,
      outputSchema: promoteCandidateOutputSchema,
      readOnly: false,
      execute: async (raw, context) => {
        const input = promoteCandidateInputSchema.parse(raw);
        return boundedResult({ revision: await repository.promoteCandidate({ ...input, signal: context.signal }) });
      },
    },
    export_model: {
      title: "Get export metadata",
      description: "Authorize browser-side 3MF generation for the authoritative current revision.",
      inputSchema: exportModelInputSchema,
      outputSchema: exportModelOutputSchema,
      readOnly: true,
      execute: async (raw) => {
        const input = exportModelInputSchema.parse(raw);
        return boundedResult({ export: await repository.getExportMetadata(input.projectId, input.revision, input.format) });
      },
    },
    list_revisions: {
      title: "List revisions",
      description: "List the authoritative revision chain from current to genesis.",
      inputSchema: listRevisionsInputSchema,
      outputSchema: listRevisionsOutputSchema,
      readOnly: true,
      execute: async (raw) => {
        const input = listRevisionsInputSchema.parse(raw);
        return boundedResult({ revisions: await repository.listRevisions(input.projectId) });
      },
    },
    restore_revision: {
      title: "Restore revision",
      description: "Restore a historical valid source as a new child of the current revision without rewinding history.",
      inputSchema: restoreRevisionInputSchema,
      outputSchema: restoreRevisionOutputSchema,
      readOnly: false,
      execute: async (raw, context) => {
        const input = restoreRevisionInputSchema.parse(raw);
        return boundedResult({ revision: await repository.restoreRevision({ ...input, signal: context.signal }) });
      },
    },
  };
}

export async function invokeCadTool(
  registry: CadToolRegistry,
  name: CadToolName,
  rawInput: unknown,
  context: CadToolContext = {},
): Promise<{ ok: true; value: Record<string, unknown> } | { ok: false; error: { code: string; message: string; details?: Record<string, unknown> } }> {
  const definition = registry[name];
  const parsed = definition.inputSchema.safeParse(rawInput);
  if (!parsed.success) return { ok: false, error: { code: "INVALID_TOOL_INPUT", message: "Tool input failed strict schema validation." } };
  try {
    const value = await definition.execute(parsed.data, context);
    return { ok: true, value: definition.outputSchema.parse(value) as Record<string, unknown> };
  } catch (error) {
    if (error instanceof CadDomainError) {
      return { ok: false, error: { code: error.code, message: error.message, details: { ...error.details } } };
    }
    return { ok: false, error: { code: "INTERNAL_ERROR", message: "The CAD tool failed safely." } };
  }
}
