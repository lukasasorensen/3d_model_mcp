import * as z from "zod/v4";
import {
  opaqueIdSchema,
  revisionIdSchema,
  sessionIdSchema,
  modelFileStateSchema,
  MODEL_FILE_LIMITS,
} from "@theoryfoundry/contracts";

export const objectLayersSnapshotSchema = z
  .object({
    revision: revisionIdSchema.nullable(),
    sourceHash: z.string().nullable(),
    state: modelFileStateSchema.nullable(),
  })
  .strict();
export const layerNameSchema = z
  .string()
  .trim()
  .pipe(modelFileStateSchema.shape.objects.element.shape.name)
  .refine(
    (name) => name.isWellFormed() && !name.includes("\0"),
    "Use valid Unicode text without NUL characters.",
  );
const layerOperationSchema = z.discriminatedUnion("op", [
  z
    .object({
      op: z.literal("rename_object"),
      id: opaqueIdSchema,
      name: layerNameSchema,
    })
    .strict(),
  z
    .object({
      op: z.literal("set_file_visibility"),
      id: opaqueIdSchema,
      visible: z.literal(true),
    })
    .strict(),
  z
    .object({
      op: z.literal("set_object_visibility"),
      id: opaqueIdSchema,
      visible: z.boolean(),
    })
    .strict(),
  z
    .object({
      op: z.literal("reorder_objects"),
      ids: z.array(opaqueIdSchema).min(1).max(MODEL_FILE_LIMITS.objects),
    })
    .strict(),
]);
export const applyObjectLayersSchema = z
  .object({
    parentRevision: revisionIdSchema,
    requestId: opaqueIdSchema,
    sessionId: sessionIdSchema,
    operations: z
      .array(layerOperationSchema)
      .min(1)
      .max(MODEL_FILE_LIMITS.operations),
  })
  .strict();
export type ObjectLayersSnapshot = z.infer<typeof objectLayersSnapshotSchema>;
export type ApplyObjectLayers = z.infer<typeof applyObjectLayersSchema>;
