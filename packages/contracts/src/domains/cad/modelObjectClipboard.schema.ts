import * as z from "zod/v4";
import { projectIdSchema } from "./identity.schema.js";
import { modelFileSchema, modelObjectSchema } from "./modelFiles.schema.js";
import { parameterSnapshotSchema } from "./parameter.schema.js";

export const modelObjectClipboardSchema = z
  .object({
    version: z.literal(1),
    projectId: projectIdSchema,
    object: modelObjectSchema.omit({ id: true, fileId: true }),
    file: modelFileSchema.omit({ id: true }),
    parameters: parameterSnapshotSchema,
  })
  .strict();
export type ModelObjectClipboard = z.infer<typeof modelObjectClipboardSchema>;
