import * as z from "zod/v4";
import {
  CAD_LIMITS,
  modelFilesSchema,
  parameterSnapshotSchema,
  parameterControlsSnapshotSchema,
  opaqueIdSchema,
  revisionIdSchema,
  sessionIdSchema,
} from "@theoryfoundry/contracts";

export const OBJECT_EDITING_LIMITS = Object.freeze({
  requestBytes: CAD_LIMITS.sourceBytes + 16 * 1024,
  history: 30,
});
export const objectEditingSnapshotSchema = z
  .object({
    revision: revisionIdSchema.nullable(),
    sourceHash: parameterControlsSnapshotSchema.shape.sourceHash,
    modelFiles: modelFilesSchema.nullable(),
    parameters: parameterSnapshotSchema,
    unsupportedReason: z.string().min(1).max(500).optional(),
  })
  .strict();
export const applyObjectEditSchema = z
  .object({
    parentRevision: revisionIdSchema,
    requestId: opaqueIdSchema,
    sessionId: sessionIdSchema,
    modelFiles: modelFilesSchema,
  })
  .strict();
export type ObjectEditingSnapshot = z.infer<typeof objectEditingSnapshotSchema>;
export type ApplyObjectEdit = z.infer<typeof applyObjectEditSchema>;
