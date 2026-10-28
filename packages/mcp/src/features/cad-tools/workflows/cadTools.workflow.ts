import {
  CAD_LIMITS,
  createCadToolCatalog,
  type CadWorkflowService,
  createProjectInputSchema,
  exportModelInputSchema,
  getProjectStateInputSchema,
  listRevisionsInputSchema,
  promoteCandidateInputSchema,
  proposeModelSourceInputSchema,
  readModelSourceInputSchema,
  restoreRevisionInputSchema,
  updateProjectInputSchema,
  validateAndRenderInputSchema,
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
  const catalog = createCadToolCatalog();
  return {
    create_project: {
      ...catalog.create_project,
      execute: async (raw): Promise<Record<string, unknown>> => {
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
      ...catalog.update_project,
      execute: async (raw): Promise<Record<string, unknown>> =>
        boundedResult({
          project: await repository.updateProject(
            updateProjectInputSchema.parse(raw),
          ),
        }),
    },
    get_project_state: {
      ...catalog.get_project_state,
      execute: async (raw): Promise<Record<string, unknown>> => {
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
      ...catalog.read_model_source,
      execute: async (raw): Promise<Record<string, unknown>> => {
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
      ...catalog.propose_model_source,
      execute: async (raw): Promise<Record<string, unknown>> =>
        boundedResult({
          candidate: await repository.proposeModelSource(
            proposeModelSourceInputSchema.parse(raw),
          ),
        }),
    },
    validate_and_render: {
      ...catalog.validate_and_render,
      execute: async (raw, context): Promise<Record<string, unknown>> => {
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
      ...catalog.promote_candidate,
      execute: async (raw, context): Promise<Record<string, unknown>> => {
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
      ...catalog.export_model,
      execute: async (raw, context): Promise<Record<string, unknown>> => {
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
      ...catalog.list_revisions,
      execute: async (raw): Promise<Record<string, unknown>> => {
        const input = listRevisionsInputSchema.parse(raw);
        return boundedResult({
          revisions: await repository.listRevisions(input.projectId),
        });
      },
    },
    restore_revision: {
      ...catalog.restore_revision,
      execute: async (raw, context): Promise<Record<string, unknown>> => {
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
