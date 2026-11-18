import * as z from "zod/v4";
import {
  applyParameterValuesSchema,
  CAD_LIMITS,
  modelFilesSchema,
  opaqueIdSchema,
  revisionIdSchema,
  sessionIdSchema,
} from "@theoryfoundry/contracts";

export const WORKING_MODEL_REQUEST_BYTES =
  2 * CAD_LIMITS.sourceBytes + 16 * 1024;

export const workingModelSchema = z.strictObject({
  parentRevision: revisionIdSchema,
  operations: z.union([
    z.tuple([]),
    applyParameterValuesSchema.shape.operations,
  ]),
  modelFiles: modelFilesSchema.optional(),
});

export const saveWorkingModelSchema = workingModelSchema.extend({
  requestId: opaqueIdSchema,
  sessionId: sessionIdSchema,
});

export const workingPreviewSchema = z.strictObject({
  parentRevision: revisionIdSchema,
  sourceHash: z.hash("sha256"),
  source: z.string().min(1).max(CAD_LIMITS.sourceBytes),
});

export type WorkingModel = z.infer<typeof workingModelSchema>;
export type SaveWorkingModel = z.infer<typeof saveWorkingModelSchema>;
export type PreparedWorkingPreview = z.infer<typeof workingPreviewSchema>;
