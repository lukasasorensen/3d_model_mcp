import * as z from "zod/v4";
import {
  CAD_LIMITS,
  diagnosticSchema,
  geometrySummarySchema,
} from "../cad/index.js";
import { previewViewSchema, PREVIEW_LIMITS } from "../preview/index.js";
export const headlessRenderInputSchema = z
  .object({
    source: z.string().max(CAD_LIMITS.sourceBytes),
    sourceHash: z.string().regex(/^[a-f0-9]{64}$/),
    format: z.enum(["stl", "3mf", "png"]),
    view: previewViewSchema.default("isometric"),
    cancelImmediately: z.boolean().optional(),
  })
  .strict();
export const headlessRenderResultSchema = z.discriminatedUnion("ok", [
  z
    .object({
      ok: z.literal(true),
      encoded: z.string().max(Math.ceil(CAD_LIMITS.exportBytes / 3) * 4),
      diagnostics: z
        .array(diagnosticSchema)
        .max(CAD_LIMITS.diagnosticCount)
        .optional(),
      geometry: geometrySummarySchema.optional(),
    })
    .strict(),
  z
    .object({
      ok: z.literal(false),
      name: z.string().max(100),
      message: z.string().max(2000),
      failureKind: z.enum(["model", "operational"]).optional(),
      diagnostics: z
        .array(diagnosticSchema)
        .max(CAD_LIMITS.diagnosticCount)
        .optional(),
    })
    .strict(),
]);
export const HEADLESS_RENDER_LIMITS = Object.freeze({
  queue: 4,
  operationMs: 105_000,
  startupMs: 25_000,
  pngBytes: PREVIEW_LIMITS.pngBytes,
});
