import {
  type ModelPreviewInput,
  type PreviewMetadata,
} from "./preview.types.js";

export interface ModelPreviewService {
  getPreview(
    input: ModelPreviewInput,
    signal?: AbortSignal,
  ): Promise<{ metadata: PreviewMetadata; png: string }>;
}
