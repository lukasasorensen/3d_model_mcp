import { createOpenScadRenderer, type BrowserCadRendererOptions } from "../worker/openscad.client.js";
import { createPreviewRenderer } from "../services/preview.service.js";
import { createPngRenderer } from "./png.renderer.js";
import { createDownloadRenderer } from "../services/download.service.js";

/** Each host owns worker construction and one independent mesh cache. */
export function createBrowserCadRenderer(options: BrowserCadRendererOptions) {
  const renderOpenScad = createOpenScadRenderer(options);
  const { renderPreview, cachedPreview } = createPreviewRenderer(renderOpenScad);
  return { renderOpenScad, renderPreview, cachedPreview,
    renderModelPng: createPngRenderer(renderPreview),
    generateDownload: createDownloadRenderer(renderOpenScad),
  };
}
