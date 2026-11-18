import * as z from "zod/v4";
import {
  opaqueIdSchema,
  projectIdSchema,
  revisionIdSchema,
} from "./identity.schema.js";
import {
  modelFileSchema,
  modelObjectSchema,
  modelFilesPresentationSchema,
  MODEL_FILE_LIMITS,
} from "./modelFiles.schema.js";
import { proposeModelSourceOutputSchema } from "./modelOperations.schema.js";
import { objectTransformSchema } from "./objectTransform.schema.js";

const target = { id: opaqueIdSchema };
const name = modelFileSchema.shape.name;
export const modelFileOperationSchema = z.discriminatedUnion("op", [
  z.object({ op: z.literal("create_file"), file: modelFileSchema }).strict(),
  z
    .object({
      op: z.literal("update_file"),
      ...target,
      body: modelFileSchema.shape.body,
    })
    .strict(),
  z.object({ op: z.literal("rename_file"), ...target, name }).strict(),
  z.object({ op: z.literal("remove_file"), ...target }).strict(),
  z
    .object({
      op: z.literal("set_file_visibility"),
      ...target,
      visible: z.boolean(),
    })
    .strict(),
  z
    .object({
      op: z.literal("reorder_files"),
      ids: z.array(opaqueIdSchema).max(MODEL_FILE_LIMITS.files),
    })
    .strict(),
  z
    .object({ op: z.literal("create_object"), object: modelObjectSchema })
    .strict(),
  z
    .object({
      op: z.literal("update_object"),
      ...target,
      fileId: opaqueIdSchema,
    })
    .strict(),
  z.object({ op: z.literal("rename_object"), ...target, name }).strict(),
  z
    .object({
      op: z.literal("set_object_transform"),
      ...target,
      transform: objectTransformSchema,
    })
    .strict(),
  z.object({ op: z.literal("remove_object"), ...target }).strict(),
  z
    .object({
      op: z.literal("set_object_visibility"),
      ...target,
      visible: z.boolean(),
    })
    .strict(),
  z
    .object({
      op: z.literal("reorder_objects"),
      ids: z.array(opaqueIdSchema).max(MODEL_FILE_LIMITS.objects),
    })
    .strict(),
]);
export type ModelFileOperation = z.infer<typeof modelFileOperationSchema>;
export const modelFileEditContentSchema = z
  .object({
    projectId: projectIdSchema,
    parentRevision: revisionIdSchema,
    operations: z
      .array(modelFileOperationSchema)
      .min(1)
      .max(MODEL_FILE_LIMITS.operations),
  })
  .strict();
export const editModelFilesInputSchema = modelFileEditContentSchema.extend({
  requestId: opaqueIdSchema,
  toolCallId: opaqueIdSchema,
});
export const modelFileStateSchema = z
  .object({
    version: z.union([z.literal(1), z.literal(2)]),
    files: z.array(modelFileSchema.omit({ body: true })),
    objects: z.array(modelObjectSchema),
    composition: z
      .object({
        operation: z.enum(["union", "difference", "intersection"]),
        objectIds: z.array(opaqueIdSchema),
      })
      .strict(),
    presentation: modelFilesPresentationSchema,
  })
  .strict();
export const editModelFilesOutputSchema = proposeModelSourceOutputSchema.extend(
  { state: modelFileStateSchema },
);
export const listModelFilesInputSchema = z
  .object({ projectId: projectIdSchema, revision: revisionIdSchema.optional() })
  .strict();
export const listModelFilesOutputSchema = z
  .object({
    revision: revisionIdSchema.nullable(),
    state: modelFileStateSchema.nullable(),
  })
  .strict();
export const readModelFileInputSchema = listModelFilesInputSchema.extend({
  fileId: opaqueIdSchema,
});
export const readModelFileOutputSchema = z
  .object({ revision: revisionIdSchema, file: modelFileSchema })
  .strict();
export const readModelObjectInputSchema = listModelFilesInputSchema.extend({
  objectId: opaqueIdSchema,
});
export const readModelObjectOutputSchema = z
  .object({
    revision: revisionIdSchema,
    object: modelObjectSchema,
    file: modelFileSchema,
  })
  .strict();
