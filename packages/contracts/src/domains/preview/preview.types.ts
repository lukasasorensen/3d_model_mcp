import type * as z from "zod/v4";
import {
  type getModelPreviewInputSchema,
  type previewMetadataSchema,
  type previewJobSchema,
  type browserPresenceSchema,
} from "./preview.schema.js";

export type ModelPreviewInput = z.infer<typeof getModelPreviewInputSchema>;

export type PreviewMetadata = z.infer<typeof previewMetadataSchema>;

export type PreviewJob = z.infer<typeof previewJobSchema>;

export type BrowserPresence = z.infer<typeof browserPresenceSchema>;
