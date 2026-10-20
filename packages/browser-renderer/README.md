# Browser CAD renderer

`@theoryfoundry/browser-renderer` is a private, browser-safe workspace package
shared by the hosted UI and the standalone headless proof. It depends on contracts,
Three.js, and fflate; it has no Next.js, HTTP job, account, database, Node, or
Playwright dependencies.

Consumers import the public entry point and provide their own worker constructor
and CAD asset origin:

```ts
import { createBrowserCadRenderer } from "@theoryfoundry/browser-renderer";

const renderer = createBrowserCadRenderer({
  createWorker: () => new Worker(new URL("./openscad.worker.ts", import.meta.url), {
    type: "module",
    name: "openscad-render",
  }),
  assetsOrigin: () => window.location.origin,
});
```

The worker entry calls `installOpenScadWorker(self)` from the same public package.
The host bundler emits that entry; the package never resolves a host-specific
worker URL. Both hosts serve the checksum-pinned assets at `/vendor/openscad/`.
The site uses a Webpack/Next.js worker entry; the proof uses an esbuild entry.

Each renderer instance exposes `renderOpenScad`, `renderPreview`, `cachedPreview`,
`renderModelPng`, and `generateDownload` and owns an independent mesh cache.
Constructing a renderer or importing the package does not start a worker or
register a global message handler. PNG input contains only source, sourceHash,
and view; transport job IDs, capabilities, and deadlines belong to the host.

Other public exports are `summarizeStl`, `browserRendererProvenance`, and download
format/MIME definitions. HTTP job completions, source fetches, and DOM download
delivery remain site adapters. Process launch and sandboxing remain headless-host
responsibilities. Renderer versions, pins, camera/lighting, geometry behavior,
limits, and error classification are preserved by the extraction.

The mesh cache retains the existing unbounded behavior. Bounding it and adding
long-lived worker supervision remain part of the future public worker release.
The package is not published; no database schema changes are involved.
