import {
  createOpenScadRenderer,
  createMeshCache,
  renderPng,
  encodeDownload,
  createRenderingWorkflow,
} from "./features/rendering/index.js";
import type { BrowserCadRendererOptions } from "./features/rendering/index.js";

/** Each host owns worker construction and one independent mesh cache. */
export function createBrowserCadRenderer(
  options: BrowserCadRendererOptions,
): ReturnType<typeof createRenderingWorkflow> {
  return createRenderingWorkflow({
    renderOpenScad: createOpenScadRenderer(options),
    cache: createMeshCache(),
    renderPng,
    encodeDownload,
  });
}
