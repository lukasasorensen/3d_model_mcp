import {
  CAD_LIMITS,
  type CadWorkflowService,
  createProjectInputSchema,
  createProjectOutputSchema,
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
  updateProjectInputSchema,
  updateProjectOutputSchema,
  validateAndRenderInputSchema,
  validateAndRenderOutputSchema,
} from "@theoryfoundry/contracts";
import {
  CadDomainError,
  type ModelProjectStore,
} from "@theoryfoundry/model-project";

import type { CadToolRegistry } from "../cadTool.types.js";
function boundedResult(
  value: Record<string, unknown>,
): Record<string, unknown> {
  const serialized = JSON.stringify(value);
  if (Buffer.byteLength(serialized) > CAD_LIMITS.toolResultBytes) {
    throw new CadDomainError(
      "ARTIFACT_LIMIT_EXCEEDED",
      "Tool result exceeds the configured response limit.",
    );
  }
  return value;
}

export function createCadToolRegistry(
  repository: ModelProjectStore,
  workflow?: CadWorkflowService,
): CadToolRegistry {
  return {
    create_project: {
      title: "Create project",
      description:
        "Create a project for the authenticated owner with a name and description. Returns its project ID and configured project URL for subsequent CAD tools. Obtain fit-critical measurements or clearly disclose assumptions.",
      inputSchema: createProjectInputSchema,
      outputSchema: createProjectOutputSchema,
      readOnly: false,
      execute: async (raw) => {
        const project = await repository.createProject(
          createProjectInputSchema.parse(raw),
        );
        return boundedResult({
          project: {
            ...project,
            ...(workflow
              ? { projectUrl: workflow.projectUrl(project.projectId) }
              : {}),
          },
        });
      },
    },
    update_project: {
      title: "Update project details",
      description:
        "Update a project's name or description. Omitted fields are preserved; the description must remain nonempty.",
      inputSchema: updateProjectInputSchema,
      outputSchema: updateProjectOutputSchema,
      readOnly: false,
      execute: async (raw) =>
        boundedResult({
          project: await repository.updateProject(
            updateProjectInputSchema.parse(raw),
          ),
        }),
    },
    get_project_state: {
      title: "Get project state",
      description:
        "Inspect the authoritative current CAD revision and its validated artifact metadata.",
      inputSchema: getProjectStateInputSchema,
      outputSchema: getProjectStateOutputSchema,
      readOnly: true,
      execute: async (raw) => {
        const input = getProjectStateInputSchema.parse(raw);
        return boundedResult({
          state: {
            ...(await repository.getProjectState(input.projectId)),
            ...(workflow
              ? {
                  projectUrl: workflow.projectUrl(input.projectId),
                  ...(await workflow.inspect(input.projectId)),
                }
              : {}),
          },
        });
      },
    },
    read_model_source: {
      title: "Read model source",
      description:
        "Read canonical OpenSCAD source for the current or a historical opaque revision ID.",
      inputSchema: readModelSourceInputSchema,
      outputSchema: readModelSourceOutputSchema,
      readOnly: true,
      execute: async (raw) => {
        const input = readModelSourceInputSchema.parse(raw);
        return boundedResult({
          model: await repository.readModelSource(
            input.projectId,
            input.revision,
          ),
        });
      },
    },
    propose_model_source: {
      title: "Propose model source",
      description:
        "Create an immutable candidate from bounded OpenSCAD source against an explicit current parent (null only for genesis).",
      inputSchema: proposeModelSourceInputSchema,
      outputSchema: proposeModelSourceOutputSchema,
      readOnly: false,
      execute: async (raw) =>
        boundedResult({
          candidate: await repository.proposeModelSource(
            proposeModelSourceInputSchema.parse(raw),
          ),
        }),
    },
    validate_and_render: {
      title: "Validate and render candidate",
      description:
        "Validate immutable source using the standard profile in a visible project browser. On BROWSER_REQUIRED open/focus projectUrl and retry the same candidate; on BROWSER_BUSY wait. Operational failures are retryable, not invalid models. Inspect get_model_preview before promotion. Geometry validation does not establish fit, strength or printability.",
      inputSchema: validateAndRenderInputSchema,
      outputSchema: validateAndRenderOutputSchema,
      readOnly: false,
      execute: async (raw, context) => {
        const input = validateAndRenderInputSchema.parse(raw);
        if (
          workflow &&
          (await repository.getCandidate(input.projectId, input.candidateId))
            .state === "CREATED"
        )
          await workflow.requireReady(input.projectId);
        try {
          return boundedResult({
            candidate: await repository.validateAndRender({
              ...input,
              signal: context.signal,
            }),
          });
        } catch (error) {
          if (workflow && error instanceof CadDomainError)
            throw new CadDomainError(error.code, error.message, {
              ...error.details,
              projectUrl: workflow.projectUrl(input.projectId),
            });
          throw error;
        }
      },
    },
    promote_candidate: {
      title: "Promote candidate",
      description:
        "Atomically promote one validated candidate if its expected parent is still current.",
      inputSchema: promoteCandidateInputSchema,
      outputSchema: promoteCandidateOutputSchema,
      readOnly: false,
      execute: async (raw, context) => {
        const input = promoteCandidateInputSchema.parse(raw);
        return boundedResult({
          revision: await repository.promoteCandidate({
            ...input,
            signal: context.signal,
          }),
        });
      },
    },
    export_model: {
      title: "Generate downloadable export",
      description:
        "Generate or reuse STL/3MF for the current revision. Requires a visible ready project browser for new exports. Returns exact file hash, bytes, filename and an expiring bearer download link. Retrieve the link to save the file; tool success does not mean it was saved locally.",
      inputSchema: exportModelInputSchema,
      outputSchema: exportModelOutputSchema,
      readOnly: false,
      execute: async (raw, context) => {
        const input = exportModelInputSchema.parse(raw);
        if (!workflow)
          throw new CadDomainError(
            "EXPORT_UNAVAILABLE",
            "Export delivery is not configured.",
          );
        return boundedResult({
          export: await workflow.exportModel({
            ...input,
            signal: context.signal,
          }),
        });
      },
    },
    list_revisions: {
      title: "List revisions",
      description:
        "List the authoritative revision chain from current to genesis.",
      inputSchema: listRevisionsInputSchema,
      outputSchema: listRevisionsOutputSchema,
      readOnly: true,
      execute: async (raw) => {
        const input = listRevisionsInputSchema.parse(raw);
        return boundedResult({
          revisions: await repository.listRevisions(input.projectId),
        });
      },
    },
    restore_revision: {
      title: "Restore revision",
      description:
        "Restore a historical valid source as a new child of the current revision without rewinding history.",
      inputSchema: restoreRevisionInputSchema,
      outputSchema: restoreRevisionOutputSchema,
      readOnly: false,
      execute: async (raw, context) => {
        const input = restoreRevisionInputSchema.parse(raw);
        return boundedResult({
          revision: await repository.restoreRevision({
            ...input,
            signal: context.signal,
          }),
        });
      },
    },
  };
}
