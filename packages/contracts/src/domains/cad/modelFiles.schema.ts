import * as z from "zod/v4";
import { CAD_LIMITS } from "./cad.constants.js";
import { opaqueIdSchema } from "./identity.schema.js";

export const MODEL_FILE_LIMITS = Object.freeze({
  files: 64,
  objects: 100,
  snapshotBytes: CAD_LIMITS.sourceBytes,
});

/** Names are labels, never filesystem paths. IDs survive renaming and reordering. */
export const modelFilesSchema = z
  .object({
    version: z.literal(1),
    files: z
      .array(
        z
          .object({
            id: opaqueIdSchema,
            name: z.string().min(1).max(100),
            body: z.string().min(1).max(CAD_LIMITS.sourceBytes),
          })
          .strict(),
      )
      .min(1)
      .max(MODEL_FILE_LIMITS.files),
    objects: z
      .array(
        z
          .object({
            id: opaqueIdSchema,
            name: z.string().min(1).max(100),
            fileId: opaqueIdSchema,
          })
          .strict(),
      )
      .min(1)
      .max(MODEL_FILE_LIMITS.objects),
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
  .strict()
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
    files: [...snapshot.files].sort(byId),
    objects: [...snapshot.objects].sort(byId),
  };
}
