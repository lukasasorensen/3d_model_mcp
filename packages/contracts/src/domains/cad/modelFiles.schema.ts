import * as z from "zod/v4";
import { CAD_LIMITS } from "./cad.constants.js";
import { opaqueIdSchema } from "./identity.schema.js";

export const MODEL_FILE_LIMITS = Object.freeze({
  files: 64,
  objects: 100,
  snapshotBytes: CAD_LIMITS.sourceBytes,
});

export const modelFileSchema = z
  .object({
    id: opaqueIdSchema,
    name: z.string().min(1).max(100),
    body: z.string().min(1).max(CAD_LIMITS.sourceBytes),
  })
  .strict();
export const modelObjectSchema = z
  .object({
    id: opaqueIdSchema,
    name: modelFileSchema.shape.name,
    fileId: opaqueIdSchema,
  })
  .strict();
export const modelFilesPresentationSchema = z
  .object({
    fileOrder: z.array(opaqueIdSchema).max(MODEL_FILE_LIMITS.files),
    objectOrder: z.array(opaqueIdSchema).max(MODEL_FILE_LIMITS.objects),
    hiddenFileIds: z.array(opaqueIdSchema).max(MODEL_FILE_LIMITS.files),
    hiddenObjectIds: z.array(opaqueIdSchema).max(MODEL_FILE_LIMITS.objects),
  })
  .strict();

/** Names are labels, never filesystem paths. IDs survive renaming and reordering. */
const modelFilesV1Schema = z
  .object({
    version: z.literal(1),
    files: z.array(modelFileSchema).min(1).max(MODEL_FILE_LIMITS.files),
    objects: z.array(modelObjectSchema).min(1).max(MODEL_FILE_LIMITS.objects),
    composition: z
      .object({
        operation: z.enum(["union", "difference", "intersection"]),
        objectIds: z
          .array(opaqueIdSchema)
          .min(1)
          .max(MODEL_FILE_LIMITS.objects),
      })
      .strict(),
  })
  .strict();

export const modelFilesSchema = z
  .discriminatedUnion("version", [
    modelFilesV1Schema,
    modelFilesV1Schema.extend({
      version: z.literal(2),
      presentation: modelFilesPresentationSchema,
    }),
  ])
  .superRefine((snapshot, context) => {
    const fail = (message: string): void => {
      context.addIssue({ code: "custom", message });
    };
    const files = new Set(snapshot.files.map((file) => file.id));
    const objects = new Set(snapshot.objects.map((object) => object.id));
    if (files.size !== snapshot.files.length) fail("File IDs must be unique.");
    if (objects.size !== snapshot.objects.length)
      fail("Object IDs must be unique.");
    for (const object of snapshot.objects)
      if (!files.has(object.fileId))
        fail(`Object ${object.id} references missing file ${object.fileId}.`);
    const composed = new Set(snapshot.composition.objectIds);
    if (composed.size !== snapshot.composition.objectIds.length)
      fail("Composition must reference each object at most once.");
    for (const id of composed)
      if (!objects.has(id))
        fail(`Composition references missing object ${id}.`);
    if (objects.size !== composed.size)
      fail("Composition must reference every object.");
    if (snapshot.version === 2) {
      for (const [ids, targets, complete] of [
        [snapshot.presentation.fileOrder, files, true],
        [snapshot.presentation.objectOrder, objects, true],
        [snapshot.presentation.hiddenFileIds, files, false],
        [snapshot.presentation.hiddenObjectIds, objects, false],
      ] as const) {
        if (
          new Set(ids).size !== ids.length ||
          ids.some((id) => !targets.has(id)) ||
          (complete && ids.length !== targets.size)
        )
          fail(
            "Presentation IDs must be unique valid targets; order must include every target.",
          );
      }
    }
    if (
      new TextEncoder().encode(JSON.stringify(snapshot)).byteLength >
      MODEL_FILE_LIMITS.snapshotBytes
    )
      fail("Model file snapshot exceeds the byte limit.");
  });

export type ModelFiles = z.infer<typeof modelFilesSchema>;

export function canonicalModelFiles(snapshot: ModelFiles): ModelFiles {
  const byId = (a: { id: string }, b: { id: string }): number =>
    a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  return {
    ...snapshot,
    ...(snapshot.version === 2
      ? {
          presentation: {
            ...snapshot.presentation,
            hiddenFileIds: [...snapshot.presentation.hiddenFileIds].sort(),
            hiddenObjectIds: [...snapshot.presentation.hiddenObjectIds].sort(),
          },
        }
      : {}),
    files: [...snapshot.files].sort(byId),
    objects: [...snapshot.objects].sort(byId),
  };
}

export type ModelFilesPresentation = z.infer<
  typeof modelFilesPresentationSchema
>;
export function modelFilesPresentation(
  snapshot: ModelFiles,
): ModelFilesPresentation {
  return snapshot.version === 2
    ? structuredClone(snapshot.presentation)
    : {
        fileOrder: snapshot.files.map((file) => file.id),
        objectOrder: snapshot.objects.map((object) => object.id),
        hiddenFileIds: [],
        hiddenObjectIds: [],
      };
}
export function visibleModelObjectIds(snapshot: ModelFiles): string[] {
  const presentation = modelFilesPresentation(snapshot);
  const hiddenFiles = new Set(presentation.hiddenFileIds);
  const hiddenObjects = new Set(presentation.hiddenObjectIds);
  const visible = new Set(
    snapshot.objects
      .filter(
        (object) =>
          !hiddenObjects.has(object.id) && !hiddenFiles.has(object.fileId),
      )
      .map((object) => object.id),
  );
  if (
    snapshot.composition.operation === "difference" &&
    !visible.has(snapshot.composition.objectIds[0]!)
  )
    return [];
  return snapshot.composition.objectIds.filter((id) => visible.has(id));
}
