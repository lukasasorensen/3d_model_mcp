import type { PreviewJob } from "@theoryfoundry/contracts";
import type { OpenScadRenderer, DownloadFormat } from "./rendering.types.js";

export interface RenderingCapabilities {
  renderOpenScad: OpenScadRenderer;
  renderPng(
    bytes: Uint8Array,
    view: PreviewJob["view"],
    signal: AbortSignal,
  ): Promise<string>;
  encodeDownload(
    bytes: Uint8Array,
    format: DownloadFormat,
  ): Promise<{
    bytes: Uint8Array;
    mimeType: string;
    extension: DownloadFormat;
  }>;
  cache: {
    get(sourceHash: string): Uint8Array | undefined;
    set(sourceHash: string, bytes: Uint8Array): void;
  };
}
