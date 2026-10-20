import { createOpenScadRenderer, type BrowserCadRendererOptions } from "./open-scad-renderer.js";
import { createPreviewRenderer } from "./preview-renderer.js";
import { createPngRenderer } from "./png-renderer.js";
import { createDownloadRenderer } from "./model-download.js";

/** Each host owns worker construction and one independent mesh cache. */
export function createBrowserCadRenderer(options: BrowserCadRendererOptions) {
  const renderOpenScad = createOpenScadRenderer(options);
  const { renderPreview, cachedPreview } = createPreviewRenderer(renderOpenScad);
  return { renderOpenScad, renderPreview, cachedPreview,
    renderModelPng: createPngRenderer(renderPreview),
    generateDownload: createDownloadRenderer(renderOpenScad),
  };
}
