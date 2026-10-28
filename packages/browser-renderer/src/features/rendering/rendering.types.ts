import type { Diagnostic, PreviewJob } from "@theoryfoundry/contracts";
export interface BrowserCadRendererOptions {
  createWorker: () => Worker;
  assetsOrigin: () => string;
}

export type RenderedMesh = { bytes: Uint8Array; diagnostics: Diagnostic[] };
export type OpenScadRenderer = (
  source: string,
  format: "stl" | "3mf",
  signal?: AbortSignal,
) => Promise<RenderedMesh>;
export type DownloadFormat = "stl" | "3mf" | "glb";

export interface BrowserCadRenderer {
  renderOpenScad: OpenScadRenderer;
  renderPreview(
    source: string,
    sourceHash: string,
    signal?: AbortSignal,
  ): Promise<RenderedMesh>;
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
