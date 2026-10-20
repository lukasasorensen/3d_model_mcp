import type { createOpenScadRenderer } from "../worker/client.js";
import type { Diagnostic } from "@theoryfoundry/contracts";

export function createPreviewRenderer(renderOpenScad: ReturnType<typeof createOpenScadRenderer>) {
  const previewCache = new Map<string, Uint8Array>();
  function cachedPreview(sourceHash: string): Uint8Array | undefined { return previewCache.get(sourceHash); }

  async function renderPreview(source: string, sourceHash: string, signal?: AbortSignal): Promise<{ bytes: Uint8Array; diagnostics: Diagnostic[] }> {
    const cached = previewCache.get(sourceHash);
    if (cached) return { bytes: cached, diagnostics: [] };
    const result = await renderOpenScad(source, "stl", signal);
    previewCache.set(sourceHash, result.bytes);
    return result;
  }

  return { cachedPreview, renderPreview };
}
