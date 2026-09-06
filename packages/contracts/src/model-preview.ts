import { z } from "zod";
import { projectIdSchema, opaqueIdSchema, sessionIdSchema, browserRenderCompletionSchema, CAD_LIMITS } from "./cad-contracts.js";

export const PREVIEW_LIMITS = Object.freeze({ dimension: 768, pngBytes: 2 * 1024 * 1024, payloadBytes: 3 * 1024 * 1024, claimMs: 15_000, deadlineMs: 80_000, presenceMs: 45_000 });
export const previewViewSchema = z.enum(["isometric", "front", "back", "left", "right", "top", "bottom"]);
export const getModelPreviewInputSchema = z.object({ projectId: projectIdSchema, revisionId: opaqueIdSchema.optional(), candidateId: opaqueIdSchema.optional(), view: previewViewSchema.default("isometric") }).strict().refine((v) => !(v.revisionId && v.candidateId), "Choose a revision or candidate, not both.");
export type ModelPreviewInput = z.infer<typeof getModelPreviewInputSchema>;
export const previewMetadataSchema = z.object({ projectId: projectIdSchema, revisionId: opaqueIdSchema.optional(), candidateId: opaqueIdSchema.optional(), sourceHash: z.string().regex(/^[a-f0-9]{64}$/), view: previewViewSchema, width: z.literal(768), height: z.literal(768), imageHash: z.string().regex(/^[a-f0-9]{64}$/) }).strict();
export type PreviewMetadata = z.infer<typeof previewMetadataSchema>;
export const previewJobSchema = previewMetadataSchema.omit({ imageHash: true }).extend({ jobId: opaqueIdSchema, token: z.string().regex(/^[a-f0-9]{64}$/), source: z.string().max(CAD_LIMITS.sourceBytes), deadline: z.string().datetime() }).strict();
export type PreviewJob = z.infer<typeof previewJobSchema>;
export const previewCompletionSchema = previewJobSchema.omit({ source: true, deadline: true }).extend({ sessionId: sessionIdSchema, provenance: browserRenderCompletionSchema.shape.provenance, png: z.string().max(Math.ceil(PREVIEW_LIMITS.pngBytes / 3) * 4).optional(), error: z.enum(["RENDER_FAILED", "CANCELLED"]).optional() }).strict().refine((v) => Boolean(v.png) !== Boolean(v.error), "Supply PNG or error.");
export const browserPresenceSchema = z.object({ sessionId: sessionIdSchema, tabId: opaqueIdSchema, visible: z.boolean(), ready: z.boolean(), busy: z.boolean(), localEnabled: z.boolean(), remoteEnabled: z.boolean() }).strict();
export type BrowserPresence = z.infer<typeof browserPresenceSchema>;
export interface ModelPreviewService { getPreview(input: ModelPreviewInput, signal?: AbortSignal): Promise<{ metadata: PreviewMetadata; png: string }> }

export const previewStatusInputSchema = z.object({ jobId: opaqueIdSchema, token: z.string().regex(/^[a-f0-9]{64}$/) }).strict();
export const previewStatusSchema = z.object({ state: z.enum(["pending", "completed", "cancelled"]) }).strict();
