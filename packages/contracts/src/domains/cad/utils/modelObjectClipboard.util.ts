import {
  modelObjectClipboardSchema,
  type ModelObjectClipboard,
} from "../modelObjectClipboard.schema.js";
import { modelFilesSchema, type ModelFiles } from "../modelFiles.schema.js";
import type { ProjectParameter } from "../parameter.schema.js";
import { applyModelFileOperations } from "./applyModelFileOperations.util.js";

function parameterBindings(parameters: readonly ProjectParameter[]): string {
  return JSON.stringify(
    parameters
      .map(({ binding, value }) => ({ binding, value }))
      .sort((left, right) => left.binding.localeCompare(right.binding)),
  );
}

export function copyModelObject(input: {
  projectId: string;
  modelFiles: ModelFiles;
  objectId: string;
  parameters?: ProjectParameter[] | undefined;
}): ModelObjectClipboard {
  const snapshot = modelFilesSchema.parse(input.modelFiles);
  const object = snapshot.objects.find((item) => item.id === input.objectId);
  if (!object) throw new Error("Select an available object before copying.");
  const file = snapshot.files.find((item) => item.id === object.fileId);
  if (!file) throw new Error("The selected object's source is unavailable.");
  return modelObjectClipboardSchema.parse({
    version: 1,
    projectId: input.projectId,
    object: {
      name: object.name,
      ...(object.transform ? { transform: object.transform } : {}),
    },
    file: { name: file.name, body: file.body },
    parameters: input.parameters ?? [],
  });
}

/** Clipboard data stays in the current project and becomes a separate source file. */
export function pasteModelObject(input: {
  projectId: string;
  modelFiles: ModelFiles;
  clipboard: unknown;
  objectId: string;
  fileId: string;
  parameters?: ProjectParameter[] | undefined;
}): ModelFiles {
  const clipboard = modelObjectClipboardSchema.parse(input.clipboard);
  if (clipboard.projectId !== input.projectId)
    throw new Error("Copy an object from this project before pasting.");
  if (
    parameterBindings(clipboard.parameters) !==
    parameterBindings(input.parameters ?? [])
  )
    throw new Error(
      "Project parameters changed since copying. Copy the object again before pasting.",
    );
  const name = (value: string): string => `${value.slice(0, 95)} copy`;
  return applyModelFileOperations(modelFilesSchema.parse(input.modelFiles), [
    {
      op: "create_file",
      file: {
        ...clipboard.file,
        name: name(clipboard.file.name),
        id: input.fileId,
      },
    },
    {
      op: "create_object",
      object: {
        ...clipboard.object,
        name: name(clipboard.object.name),
        id: input.objectId,
        fileId: input.fileId,
      },
    },
  ]);
}
