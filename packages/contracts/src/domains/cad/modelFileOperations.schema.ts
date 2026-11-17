import * as z from "zod/v4";
import { CAD_LIMITS } from "./cad.constants.js";
import {
  opaqueIdSchema,
  projectIdSchema,
  revisionIdSchema,
} from "./identity.schema.js";
import {
  modelFileSchema,
  modelObjectSchema,
  modelFilesPresentationSchema,
  modelFilesSchema,
} from "./modelFiles.schema.js";
import { proposeModelSourceOutputSchema } from "./modelOperations.schema.js";

const target = { id: opaqueIdSchema };
const name = z.string().min(1).max(100);
export const modelFileOperationSchema = z.discriminatedUnion("op", [
  z.object({ op: z.literal("create_file"), file: modelFileSchema }).strict(),
  z
    .object({
      op: z.literal("update_file"),
      ...target,
      body: z.string().min(1).max(CAD_LIMITS.sourceBytes),
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
      ids: z.array(opaqueIdSchema).max(64),
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
      ids: z.array(opaqueIdSchema).max(100),
    })
    .strict(),
]);
export type ModelFileOperation = z.infer<typeof modelFileOperationSchema>;
export const modelFileEditContentSchema = z
  .object({
    projectId: projectIdSchema,
    parentRevision: revisionIdSchema,
    operations: z.array(modelFileOperationSchema).min(1).max(200),
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
export const modelFilesDocumentSchema = modelFilesSchema;
