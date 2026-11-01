import { createHash } from "node:crypto";
import { build } from "esbuild";
import { root, applicationStyles } from "../../../../browser.fixture.mjs";
import { provenance } from "../../../../../features/workspace/browser/fixtures/workspace.fixture.ts";
import {
  BROWSER_RENDERER,
  revisionManifestSchema,
} from "@theoryfoundry/contracts";

export async function mountWorkspaceJourney(page, width) {
  const sources = { r1: "cube(10);", r2: "cube(20);", r3: "cube(10);" };
  const revisions = Object.entries(sources).map(([revisionId, source], index) =>
    revisionManifestSchema.parse({
      version: "1",
      projectId: "sample",
      revisionId,
      parentRevision: index ? `r${index}` : null,
      ...(index === 2 ? { restoredFrom: "r1" } : {}),
      sourceHash: createHash("sha256").update(source).digest("hex"),
      sourceBytes: Buffer.byteLength(source),
      createdAt: "2026-10-31T12:00:00Z",
      requestId: `request-${revisionId}`,
      toolCallId: `tool-${revisionId}`,
      candidateId: `candidate-${revisionId}`,
      validationPolicyVersion: "1",
      validationResult: "VALID",
      diagnostics: [],
      artifacts: [],
      renderer: provenance,
    }),
  );
  const controls = {
    current: "r2",
    failRestore: false,
    corruptSource: false,
    restoreRequests: [],
    sourceRequests: [],
  };
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/*", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (request.isNavigationRequest())
      return route.fulfill({
        contentType: "text/html",
        body: '<div id="root"></div>',
      });
    const json = (value) => route.fulfill({ json: value });
    if (path === "/v1/readiness") return json({ ready: true });
    if (path === "/vendor/openscad/manifest.json")
      return json(BROWSER_RENDERER);
    if (path === "/v1/features/sidebar-chat")
      return json({ isSidebarChatEnabled: false });
    if (path === "/v1/projects")
      return json({
        projects: [
          { projectId: "sample", name: "Bracket", description: "Fixture" },
        ],
      });
    if (path.endsWith("/events")) return route.fulfill({ status: 401 });
    if (path.endsWith("/claim") || path.endsWith("/preview-presence"))
      return route.fulfill({ status: 204 });
    if (path.endsWith("/restore")) {
      controls.restoreRequests.push({ path, method: request.method() });
      if (controls.failRestore) return route.fulfill({ status: 500, json: {} });
      controls.current = "r3";
      return json({ revision: revisions[2] });
    }
    if (path.endsWith("/source")) {
      const id = path.split("/").at(-2);
      controls.sourceRequests.push(id);
      return route.fulfill({
        contentType: "text/plain",
        body: controls.corruptSource ? "tampered" : sources[id],
        headers: {
          "x-theoryfoundry-source-hash": revisions.find(
            (r) => r.revisionId === id,
          ).sourceHash,
          "x-theoryfoundry-source-revision": id,
        },
      });
    }
    if (path === "/v1/projects/sample")
      return json({
        state: {
          projectId: "sample",
          currentRevision: controls.current,
          source: null,
          artifacts: [],
          diagnostics: [],
        },
        revisions: revisions
          .slice(0, controls.current === "r3" ? 3 : 2)
          .reverse(),
      });
    throw new Error(`Unexpected fixture request: ${request.method()} ${path}`);
  });
  const result = await build({
    stdin: {
      contents: `import React from 'react'; import {createRoot} from 'react-dom/client'; import {ModelWorkspace} from './src/features/workspace/browser/components/modelWorkspace.component'; import {BrowserRendererContext} from './src/features/browser-rendering/browser/index'; const renderer={generateDownload:async(source,format)=>{window.generatedSource=source;return {bytes:new TextEncoder().encode(source),extension:format,mimeType:'application/octet-stream'}}}; createRoot(document.getElementById('root')).render(<BrowserRendererContext.Provider value={renderer}><ModelWorkspace projectId="sample"/></BrowserRendererContext.Provider>);`,
      resolveDir: root + "/apps/site",
      loader: "tsx",
    },
    bundle: true,
    write: false,
    jsx: "automatic",
    plugins: [
      {
        name: "framework-viewer-boundaries",
        setup(b) {
          b.onResolve({ filter: /^next\/(navigation|dynamic)$/ }, (args) => ({
            path: args.path,
            namespace: "fixture",
          }));
          b.onLoad({ filter: /.*/, namespace: "fixture" }, ({ path }) => ({
            loader: "tsx",
            resolveDir: root + "/apps/site",
            contents: path.endsWith("navigation")
              ? `export function useRouter(){return {push(){}}}`
              : `import {useEffect} from 'react';export default function dynamic(){return function Viewer({revisionId,onLoadStateChange}){useEffect(()=>onLoadStateChange('ready'),[revisionId,onLoadStateChange]);return <div aria-label="Preview fixture">{revisionId}</div>}}`,
          }));
        },
      },
    ],
  });
  await page.setViewportSize({ width, height: 900 });
  await page.goto("https://example.test/projects/sample");
  await page.addStyleTag({ content: await applicationStyles() });
  await page.addScriptTag({ content: result.outputFiles[0].text });
  return { controls, errors };
}
