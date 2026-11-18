import * as z from "zod/v4";
import { opaqueIdSchema } from "./identity.schema.js";

const fieldPath = z
  .string()
  .regex(/^(?:[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)*)?$/);

/** Bounded model-facing diagnostics; unrelated error metadata is never forwarded. */
export const parameterToolErrorSchema = z.object({
  code: z.enum([
    "INVALID_PARAMETERS",
    "INVALID_TOOL_INPUT",
    "INVALID_MODEL_FILES",
  ]),
  message: z.string().min(1).max(500),
  details: z
    .object({
      path: fieldPath.max(200).optional(),
      reason: z.string().max(200).optional(),
      fileId: opaqueIdSchema.optional(),
      parameterId: z
        .string()
        .regex(/^[A-Za-z0-9_-]{1,100}$/)
        .optional(),
      binding: z
        .string()
        .regex(/^[A-Za-z_][A-Za-z0-9_]{0,99}$/)
        .optional(),
      field: fieldPath.max(100).optional(),
      diagnostic: z
        .string()
        .regex(/^[A-Z][A-Z0-9_]{0,79}$/)
        .optional(),
      line: z.number().int().positive().safe().optional(),
      column: z.number().int().positive().safe().optional(),
    })
    .optional(),
});

export type ParameterToolError = z.infer<typeof parameterToolErrorSchema>;
