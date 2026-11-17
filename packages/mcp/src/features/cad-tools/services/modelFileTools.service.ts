import * as z from "zod/v4";
import {
  applyModelFileOperations,
  modelFileState,
  modelRecordMetadata,
  createCadToolCatalog,
  editModelFilesInputSchema,
  listModelFilesInputSchema,
  readModelFileInputSchema,
  readModelObjectInputSchema,
} from "@theoryfoundry/contracts";
import {
  CadDomainError,
  type ModelProjectStore,
} from "@theoryfoundry/model-project";
import type { CadToolRegistry } from "../cadTool.types.js";

type FileTools = Pick<
  CadToolRegistry,
  | "list_model_files"
  | "list_model_objects"
  | "read_model_file"
  | "read_model_object"
  | "edit_model_files"
>;
export function createModelFileTools(repository: ModelProjectStore): FileTools {
  const catalog = createCadToolCatalog();
  const list = async (raw: unknown): Promise<Record<string, unknown>> => {
    const input = listModelFilesInputSchema.parse(raw);
    const state = await repository.getProjectState(input.projectId);
    const revision = input.revision ?? state.currentRevision;
    if (revision === null) return { revision: null, state: null };
    const model = await repository.readModelSource(input.projectId, revision);
    return {
      revision: model.revision,
      state: model.modelFiles ? modelFileState(model.modelFiles) : null,
    };
  };
  return {
    list_model_files: { ...catalog.list_model_files, execute: list },
    list_model_objects: { ...catalog.list_model_objects, execute: list },
    read_model_file: {
      ...catalog.read_model_file,
      execute: async (raw) => {
        const input = readModelFileInputSchema.parse(raw);
        const model = await repository.readModelSource(
          input.projectId,
          input.revision,
        );
        const file = model.modelFiles?.files.find(
          (file) => file.id === input.fileId,
        );
        if (!file)
          throw new CadDomainError(
            "INVALID_MODEL_FILES",
            "File ID does not exist in the selected revision.",
            { fileId: input.fileId },
          );
        return { revision: model.revision, file };
      },
    },
    read_model_object: {
      ...catalog.read_model_object,
      execute: async (raw) => {
        const input = readModelObjectInputSchema.parse(raw);
        const model = await repository.readModelSource(
          input.projectId,
          input.revision,
        );
        const object = model.modelFiles?.objects.find(
          (object) => object.id === input.objectId,
        );
        if (!object)
          throw new CadDomainError(
            "INVALID_MODEL_FILES",
            "Object ID does not exist in the selected revision.",
            { objectId: input.objectId },
          );
        const file = model.modelFiles!.files.find(
          (file) => file.id === object.fileId,
        )!;
        return { revision: model.revision, object, file };
      },
    },
    edit_model_files: {
      ...catalog.edit_model_files,
      execute: async (raw) => {
        const input = editModelFilesInputSchema.parse(raw);
        // Resolve the named parent even after promotion so retries retain their original identity.
        await repository.getProjectState(input.projectId);
        const parent = await repository.readModelSource(
          input.projectId,
          input.parentRevision,
        );
        if (!parent.modelFiles)
          throw new CadDomainError(
            "INVALID_MODEL_FILES",
            "Use a complete modelFiles proposal to adopt a legacy or empty project.",
          );
        let modelFiles;
        try {
          modelFiles = applyModelFileOperations(
            parent.modelFiles,
            input.operations,
          );
        } catch (error) {
          if (!(error instanceof z.ZodError)) throw error;
          throw new CadDomainError(
            "INVALID_MODEL_FILES",
            error.issues[0]!.message,
            { path: error.issues[0]!.path.map(String).join(".") },
          );
        }
        const candidate = await repository.proposeModelSource({
          projectId: input.projectId,
          parentRevision: input.parentRevision,
          requestId: input.requestId,
          toolCallId: input.toolCallId,
          modelFiles,
        });
        return {
          candidate: modelRecordMetadata(candidate),
          state: modelFileState(modelFiles),
        };
      },
    },
  };
}
