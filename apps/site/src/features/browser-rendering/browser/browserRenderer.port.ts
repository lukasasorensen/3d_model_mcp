import type { DownloadFormat } from "@theoryfoundry/browser-renderer";
import type { Diagnostic, PreviewJob } from "@theoryfoundry/contracts";
export interface BrowserRenderer {
  renderPreview(
    source: string,
    sourceHash: string,
    signal?: AbortSignal,
  ): Promise<{ bytes: Uint8Array; diagnostics: Diagnostic[] }>;
  cachedPreview(sourceHash: string): Uint8Array | undefined;
  renderModelPng(
    job: Pick<PreviewJob, "source" | "sourceHash" | "view">,
    signal: AbortSignal,
  ): Promise<string>;
  generateDownload(
    source: string,
    format: DownloadFormat,
    signal?: AbortSignal,
  ): Promise<{
    bytes: Uint8Array;
    mimeType: string;
    extension: DownloadFormat;
  }>;
}
