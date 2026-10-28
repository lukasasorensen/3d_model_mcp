import { createBrowserCadRenderer } from "@theoryfoundry/browser-renderer";

export const browserRenderer = createBrowserCadRenderer({
  createWorker: () =>
    new Worker(new URL("./openScadWorker.composition.ts", import.meta.url), {
      type: "module",
      name: "openscad-render",
    }),
  assetsOrigin: () => window.location.origin,
});
