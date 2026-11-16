import * as z from "zod/v4";
import { CAD_LIMITS } from "./cad.constants.js";
import {
  opaqueIdSchema,
  projectIdSchema,
  revisionIdSchema,
} from "./identity.schema.js";
import {
  parameterSnapshotSchema,
  projectParameterSchema,
} from "./parameter.schema.js";
import { proposeModelSourceOutputSchema } from "./modelOperations.schema.js";

const parameterId = z.string().regex(/^[A-Za-z0-9_-]{1,100}$/);
export const parameterOperationSchema = z.discriminatedUnion("op", [
  z
    .object({ op: z.literal("create"), parameter: projectParameterSchema })
    .strict(),
  z
    .object({ op: z.literal("update"), parameter: projectParameterSchema })
    .strict(),
  z
    .object({
      op: z.literal("set_value"),
      id: parameterId,
      value: z.union([z.number().finite(), z.string().max(1024), z.boolean()]),
    })
    .strict(),
  z.object({ op: z.literal("delete"), id: parameterId }).strict(),
]);

export const parameterEditContentSchema = z
  .object({
    projectId: projectIdSchema,
    parentRevision: revisionIdSchema.nullable(),
    modelBody: z.string().min(1).max(CAD_LIMITS.sourceBytes).optional(),
    operations: z
      .array(parameterOperationSchema)
      .min(1)
      .max(200)
      .superRefine((operations, context) => {
        const seen = new Set<string>();
        operations.forEach((operation, index) => {
          const id =
            "parameter" in operation ? operation.parameter.id : operation.id;
          if (seen.has(id))
            context.addIssue({
              code: "custom",
              message: "Each parameter ID may be targeted only once per batch.",
              path: [index],
            });
          seen.add(id);
        });
      }),
  })
  .strict();

export const editParametersInputSchema = parameterEditContentSchema.extend({
  requestId: opaqueIdSchema,
  toolCallId: opaqueIdSchema,
});
export const editParametersOutputSchema = proposeModelSourceOutputSchema;
export const listModelParametersInputSchema = z
  .object({
    projectId: projectIdSchema,
    revision: revisionIdSchema.optional(),
  })
  .strict();
export const listModelParametersOutputSchema = z
  .object({
    revision: revisionIdSchema.nullable(),
    parameters: parameterSnapshotSchema,
  })
  .strict();
export type ParameterOperation = z.infer<typeof parameterOperationSchema>;
