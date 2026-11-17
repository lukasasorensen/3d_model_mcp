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
const layerOperationSchema = z.discriminatedUnion("op", [
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
      .max(MODEL_FILE_LIMITS.objects + MODEL_FILE_LIMITS.files + 1),
  })
  .strict();
export type ObjectLayersSnapshot = z.infer<typeof objectLayersSnapshotSchema>;
export type ApplyObjectLayers = z.infer<typeof applyObjectLayersSchema>;
