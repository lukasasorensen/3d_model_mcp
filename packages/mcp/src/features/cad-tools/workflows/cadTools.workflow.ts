import * as z from "zod/v4";
import {
  applyParameterOperations,
  editParametersInputSchema,
  listModelParametersInputSchema,
  CAD_LIMITS,
  modelRecordMetadata,
  createCadToolCatalog,
  type CadWorkflowService,
  createProjectInputSchema,
  exportModelInputSchema,
  getProjectStateInputSchema,
  listRevisionsInputSchema,
  listProjectsInputSchema,
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
    list_projects: {
      ...catalog.list_projects,
      execute: async (raw): Promise<Record<string, unknown>> => {
        listProjectsInputSchema.parse(raw);
        return boundedResult({
          projects: (await repository.listProjects()).map((project) => ({
            ...project,
            ...(workflow
              ? { projectUrl: workflow.projectUrl(project.projectId) }
              : {}),
          })),
        });
      },
    },
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
        const model = await repository.readModelSource(
          input.projectId,
          input.revision,
        );
        // Generated documents expose editable body + JSON once, not a duplicate assembled source.
        const { source, modelBody, ...editable } = model;
        void source;
        return boundedResult({
          model: model.modelFiles
            ? editable
            : modelBody === undefined
              ? model
              : { ...editable, modelBody },
        });
      },
    },
    list_model_parameters: {
      ...catalog.list_model_parameters,
      execute: async (raw): Promise<Record<string, unknown>> => {
        const input = listModelParametersInputSchema.parse(raw);
        const revision =
          input.revision ??
          (await repository.getProjectState(input.projectId)).currentRevision;
        if (revision === null) return { revision: null, parameters: [] };
        const model = await repository.readModelSource(
          input.projectId,
          revision,
        );
        return boundedResult({
          revision: model.revision,
          parameters: model.parameters ?? [],
        });
      },
    },
    edit_parameters: {
      ...catalog.edit_parameters,
      execute: async (raw): Promise<Record<string, unknown>> => {
        const input = editParametersInputSchema.parse(raw);
        // Never resolve edits against current: retries must use their original parent.
        await repository.getProjectState(input.projectId);
        const parent =
          input.parentRevision === null
            ? undefined
            : await repository.readModelSource(
                input.projectId,
                input.parentRevision,
              );
        if (parent?.modelFiles && input.modelBody !== undefined)
          throw new CadDomainError(
            "INVALID_MODEL_FILES",
            "Edit file bodies through a complete modelFiles proposal; parameter edits preserve the snapshot.",
          );
        const modelBody = input.modelBody ?? parent?.modelBody;
        if (modelBody === undefined && !parent?.modelFiles)
          throw new CadDomainError(
            "INVALID_PARAMETERS",
            "Supply modelBody explicitly for genesis or legacy parameter adoption.",
            { field: "modelBody" },
          );
        let parameters;
        try {
          parameters = applyParameterOperations(
            parent?.parameters ?? [],
            input.operations,
          );
        } catch (error) {
          if (!(error instanceof z.ZodError)) throw error;
          const issue = error.issues[0]!;
          throw new CadDomainError("INVALID_PARAMETERS", issue.message, {
            path: issue.path.map(String).join("."),
          });
        }
        return boundedResult({
          candidate: modelRecordMetadata(
            await repository.proposeModelSource({
              projectId: input.projectId,
              parentRevision: input.parentRevision,
              requestId: input.requestId,
              toolCallId: input.toolCallId,
              ...(parent?.modelFiles
                ? { modelFiles: parent.modelFiles }
                : { modelBody }),
              parameters,
            }),
          ),
        });
      },
    },
    propose_model_source: {
      ...catalog.propose_model_source,
      execute: async (raw): Promise<Record<string, unknown>> =>
        boundedResult({
          candidate: modelRecordMetadata(
            await repository.proposeModelSource(
              proposeModelSourceInputSchema.parse(raw),
            ),
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
            candidate: modelRecordMetadata(
              await repository.validateAndRender({
                ...input,
                signal: context.signal,
              }),
            ),
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
          revision: modelRecordMetadata(
            await repository.promoteCandidate({
              ...input,
              signal: context.signal,
            }),
          ),
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
          revisions: (await repository.listRevisions(input.projectId)).map(
            ({ parameters, modelBody, modelFiles, ...revision }) => {
              void parameters;
              void modelBody;
              void modelFiles;
              return revision;
            },
          ),
        });
      },
    },
    restore_revision: {
      ...catalog.restore_revision,
      execute: async (raw, context): Promise<Record<string, unknown>> => {
        const input = restoreRevisionInputSchema.parse(raw);
        return boundedResult({
          revision: modelRecordMetadata(
            await repository.restoreRevision({
              ...input,
              signal: context.signal,
            }),
          ),
        });
      },
    },
  };
}
