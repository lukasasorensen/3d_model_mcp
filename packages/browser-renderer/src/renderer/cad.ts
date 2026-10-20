import { createOpenScadRenderer, type BrowserCadRendererOptions } from "../worker/client.js";
import { createPreviewRenderer } from "../services/preview.js";
import { createPngRenderer } from "./png.js";
import { createDownloadRenderer } from "../services/download.js";

/** Each host owns worker construction and one independent mesh cache. */
export function createBrowserCadRenderer(options: BrowserCadRendererOptions) {
  const renderOpenScad = createOpenScadRenderer(options);
  const { renderPreview, cachedPreview } = createPreviewRenderer(renderOpenScad);
  return { renderOpenScad, renderPreview, cachedPreview,
    renderModelPng: createPngRenderer(renderPreview),
    generateDownload: createDownloadRenderer(renderOpenScad),
  };
}
