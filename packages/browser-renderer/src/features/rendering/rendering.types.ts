import type { Diagnostic } from "@theoryfoundry/contracts";
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
