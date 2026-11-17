import * as z from "zod/v4";
import {
  canonicalModelFiles,
  modelFilesSchema,
  modelFilesPresentation,
  type ModelFiles,
} from "../modelFiles.schema.js";
import {
  modelFileOperationSchema,
  type ModelFileOperation,
} from "../modelFileOperations.schema.js";

/** All operations apply to one immutable named parent; the complete result is validated atomically. */
export function applyModelFileOperations(
  snapshot: ModelFiles,
  operations: readonly ModelFileOperation[],
): ModelFiles {
  const files = structuredClone(snapshot.files);
  const objects = structuredClone(snapshot.objects);
  const composition = structuredClone(snapshot.composition);
  const presentation = modelFilesPresentation(snapshot);
  const fail = (message: string, index: number): never => {
    throw new z.ZodError([
      { code: "custom", message, path: ["operations", index] },
    ]);
  };
  operations.forEach((raw, index) => {
    const operation = modelFileOperationSchema.parse(raw);
    if (operation.op === "reorder_files") {
      presentation.fileOrder = [...operation.ids];
      return;
    }
    if (operation.op === "reorder_objects") {
      presentation.objectOrder = [...operation.ids];
      return;
    }
    if (operation.op === "create_file") {
      if (files.some((file) => file.id === operation.file.id))
        fail("File ID already exists.", index);
      files.push({ ...operation.file });
      presentation.fileOrder.push(operation.file.id);
      return;
    }
    if (operation.op === "create_object") {
      if (objects.some((object) => object.id === operation.object.id))
        fail("Object ID already exists.", index);
      objects.push({ ...operation.object });
      presentation.objectOrder.push(operation.object.id);
      composition.objectIds.push(operation.object.id);
      return;
    }
    const file = files.find((file) => file.id === operation.id);
    const object = objects.find((object) => object.id === operation.id);
    switch (operation.op) {
      case "update_file":
        if (!file) fail("File ID does not exist.", index);
        file!.body = operation.body;
        break;
      case "rename_file":
        if (!file) fail("File ID does not exist.", index);
        file!.name = operation.name;
        break;
      case "remove_file":
        if (!file) fail("File ID does not exist.", index);
        files.splice(files.indexOf(file!), 1);
        presentation.fileOrder = presentation.fileOrder.filter(
          (id) => id !== operation.id,
        );
        presentation.hiddenFileIds = presentation.hiddenFileIds.filter(
          (id) => id !== operation.id,
        );
        break;
      case "set_file_visibility":
        if (!file) fail("File ID does not exist.", index);
        presentation.hiddenFileIds = presentation.hiddenFileIds.filter(
          (id) => id !== operation.id,
        );
        if (!operation.visible) presentation.hiddenFileIds.push(operation.id);
        break;
      case "update_object":
        if (!object) fail("Object ID does not exist.", index);
        object!.fileId = operation.fileId;
        break;
      case "rename_object":
        if (!object) fail("Object ID does not exist.", index);
        object!.name = operation.name;
        break;
      case "set_object_transform":
        if (!object) fail("Object ID does not exist.", index);
        object!.transform = structuredClone(operation.transform);
        break;
      case "remove_object":
        if (!object) fail("Object ID does not exist.", index);
        if (
          composition.operation === "difference" &&
          composition.objectIds[0] === operation.id
        )
          fail(
            "The difference base cannot be removed; propose an explicit new composition instead.",
            index,
          );
        objects.splice(objects.indexOf(object!), 1);
        presentation.objectOrder = presentation.objectOrder.filter(
          (id) => id !== operation.id,
        );
        presentation.hiddenObjectIds = presentation.hiddenObjectIds.filter(
          (id) => id !== operation.id,
        );
        composition.objectIds = composition.objectIds.filter(
          (id) => id !== operation.id,
        );
        break;
      case "set_object_visibility":
        if (!object) fail("Object ID does not exist.", index);
        presentation.hiddenObjectIds = presentation.hiddenObjectIds.filter(
          (id) => id !== operation.id,
        );
        if (!operation.visible) presentation.hiddenObjectIds.push(operation.id);
        break;
    }
  });
  return canonicalModelFiles(
    modelFilesSchema.parse({
      version: 2,
      files,
      objects,
      composition,
      presentation,
    }),
  );
}
export function modelFileState(snapshot: ModelFiles): {
  version: 1 | 2;
  files: { id: string; name: string }[];
  objects: ModelFiles["objects"];
  composition: ModelFiles["composition"];
  presentation: ReturnType<typeof modelFilesPresentation>;
} {
  return {
    version: snapshot.version,
    files: snapshot.files.map(({ id, name }) => ({ id, name })),
    objects: structuredClone(snapshot.objects),
    composition: structuredClone(snapshot.composition),
    presentation: modelFilesPresentation(snapshot),
  };
}
