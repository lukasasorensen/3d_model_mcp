import * as z from "zod/v4";
import {
  projectIdSchema,
  opaqueIdSchema,
  CAD_LIMITS,
  sessionIdSchema,
  browserRenderCompletionSchema,
} from "../cad/index.js";
import { previewViewSchema } from "./previewView.enum.js";
import { PREVIEW_LIMITS } from "./preview.constants.js";

export const getModelPreviewInputSchema = z
  .object({
    projectId: projectIdSchema,
    revisionId: opaqueIdSchema.optional(),
    candidateId: opaqueIdSchema.optional(),
    view: previewViewSchema.default("isometric"),
  })
  .strict()
  .refine(
    (v) => !(v.revisionId && v.candidateId),
    "Choose a revision or candidate, not both.",
  );

export const previewMetadataSchema = z
  .object({
    projectId: projectIdSchema,
    revisionId: opaqueIdSchema.optional(),
    candidateId: opaqueIdSchema.optional(),
    sourceHash: z.string().regex(/^[a-f0-9]{64}$/),
    view: previewViewSchema,
    width: z.literal(768),
    height: z.literal(768),
    imageHash: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();

export const previewJobSchema = previewMetadataSchema
  .omit({ imageHash: true })
  .extend({
    jobId: opaqueIdSchema,
    token: z.string().regex(/^[a-f0-9]{64}$/),
    source: z.string().max(CAD_LIMITS.sourceBytes),
    deadline: z.string().datetime(),
  })
  .strict();

export const previewCompletionSchema = previewJobSchema
  .omit({ source: true, deadline: true })
  .extend({
    sessionId: sessionIdSchema,
    provenance: browserRenderCompletionSchema.shape.provenance,
    png: z
      .string()
      .max(Math.ceil(PREVIEW_LIMITS.pngBytes / 3) * 4)
      .optional(),
    error: z.enum(["RENDER_FAILED", "CANCELLED"]).optional(),
  })
  .strict()
  .refine((v) => Boolean(v.png) !== Boolean(v.error), "Supply PNG or error.");

export const browserPresenceSchema = z
  .object({
    sessionId: sessionIdSchema,
    tabId: opaqueIdSchema,
    visible: z.boolean(),
    ready: z.boolean(),
    busy: z.boolean(),
    localEnabled: z.boolean(),
    remoteEnabled: z.boolean(),
  })
  .strict();

export const previewStatusInputSchema = z
  .object({ jobId: opaqueIdSchema, token: z.string().regex(/^[a-f0-9]{64}$/) })
  .strict();

export const previewStatusSchema = z
  .object({ state: z.enum(["pending", "completed", "cancelled"]) })
  .strict();
