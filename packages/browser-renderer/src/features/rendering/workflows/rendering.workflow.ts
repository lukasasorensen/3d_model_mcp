import type { PreviewJob } from "@theoryfoundry/contracts";
import type { RenderingCapabilities } from "../rendering.port.js";
import type { DownloadFormat, RenderedMesh } from "../rendering.types.js";

/** Coordinates independent compilation, cache, image and download capabilities. */
export function createRenderingWorkflow(capabilities: RenderingCapabilities) {
  const { renderOpenScad, cache } = capabilities;
  async function renderPreview(
    source: string,
    sourceHash: string,
    signal?: AbortSignal,
  ): Promise<RenderedMesh> {
    const cached = cache.get(sourceHash);
    if (cached) return { bytes: cached, diagnostics: [] };
    const result = await renderOpenScad(source, "stl", signal);
    cache.set(sourceHash, result.bytes);
    return result;
  }
  async function renderModelPng(
    job: Pick<PreviewJob, "source" | "sourceHash" | "view">,
    signal: AbortSignal,
  ): Promise<string> {
    signal.throwIfAborted();
    const hash = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(job.source),
    );
    if (
      Array.from(new Uint8Array(hash), (v) =>
        v.toString(16).padStart(2, "0"),
      ).join("") !== job.sourceHash
    )
      throw new Error("Preview source hash mismatch.");
    signal.throwIfAborted();
    const { bytes } = await renderPreview(job.source, job.sourceHash, signal);
    return capabilities.renderPng(bytes, job.view, signal);
  }
  async function generateDownload(
    source: string,
    format: DownloadFormat,
    signal?: AbortSignal,
  ) {
    const result = await renderOpenScad(
      source,
      format === "3mf" ? "3mf" : "stl",
      signal,
    );
    return capabilities.encodeDownload(result.bytes, format);
  }
  return {
    renderOpenScad,
    renderPreview,
    cachedPreview: cache.get,
    renderModelPng,
    generateDownload,
  };
}
