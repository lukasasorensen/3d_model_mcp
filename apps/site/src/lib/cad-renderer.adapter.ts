import { createBrowserCadRenderer } from "@theoryfoundry/browser-renderer";

export const { renderOpenScad, renderPreview, cachedPreview, renderModelPng, generateDownload } = createBrowserCadRenderer({
  createWorker: () => new Worker(new URL("./openscad.worker.ts", import.meta.url), { type: "module", name: "openscad-render" }),
  assetsOrigin: () => window.location.origin,
});
