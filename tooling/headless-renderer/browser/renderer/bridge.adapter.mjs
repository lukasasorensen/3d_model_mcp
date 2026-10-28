/* global Worker, window */
import { createHeadlessRendererBridge } from "@theoryfoundry/browser-renderer";
globalThis.cadProof = createHeadlessRendererBridge({
  createWorker: () =>
    new Worker(new URL("./openscad-worker.js", import.meta.url), {
      type: "module",
      name: "openscad-render",
    }),
  assetsOrigin: () => window.location.origin,
});
