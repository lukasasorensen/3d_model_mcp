import * as z from "zod/v4";
import {
  opaqueIdSchema,
  revisionIdSchema,
  sessionIdSchema,
} from "./identity.schema.js";
import { parameterSnapshotSchema } from "./parameter.schema.js";
import { parameterOperationSchema } from "./parameterOperations.schema.js";
import { remoteMcpBrowserRenderJobSchema } from "./browserRender.schema.js";
import { parameterToolErrorSchema } from "./parameterToolError.schema.js";

export const parameterControlsSnapshotSchema = z
  .object({
    revision: revisionIdSchema.nullable(),
    sourceHash: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .nullable(),
    editable: z.boolean(),
    parameters: parameterSnapshotSchema,
  })
  .strict();

export const applyParameterValuesSchema = z
  .object({
    parentRevision: revisionIdSchema,
    requestId: opaqueIdSchema,
    sessionId: sessionIdSchema,
    operations: z
      .array(parameterOperationSchema.options[2])
      .min(1)
      .max(100)
      .refine(
        (items) => new Set(items.map((item) => item.id)).size === items.length,
        "Each parameter may be changed only once.",
      ),
  })
  .strict();

export const parameterControlsErrorSchema = z
  .object({
    code: z.string().regex(/^[A-Z][A-Z0-9_]{0,79}$/),
    message: z.string().max(500),
    details: parameterToolErrorSchema.shape.details,
  })
  .strict();

const identity = {
  requestId: opaqueIdSchema,
  sessionId: sessionIdSchema,
  sequence: z.number().int().min(0),
};
export const parameterControlsEventSchema = z.discriminatedUnion("type", [
  z
    .object({
      ...identity,
      type: z.literal("progress"),
      stage: z.enum(["proposing", "validating", "promoting"]),
    })
    .strict(),
  z
    .object({
      ...identity,
      type: z.literal("render"),
      job: remoteMcpBrowserRenderJobSchema,
    })
    .strict(),
  z
    .object({
      ...identity,
      type: z.literal("saved"),
      revision: revisionIdSchema,
    })
    .strict(),
  z
    .object({
      ...identity,
      type: z.literal("error"),
      error: parameterControlsErrorSchema,
    })
    .strict(),
]);
export type ParameterControlsSnapshot = z.infer<
  typeof parameterControlsSnapshotSchema
>;
export type ApplyParameterValues = z.infer<typeof applyParameterValuesSchema>;
export type ParameterControlsEvent = z.infer<
  typeof parameterControlsEventSchema
>;
export type ParameterControlsError = z.infer<
  typeof parameterControlsErrorSchema
>;
