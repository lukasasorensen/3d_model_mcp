import { createHash } from "node:crypto";
import { build } from "esbuild";
import { root, applicationStyles } from "../../../../browser.fixture.mjs";
import { provenance } from "../../../../../features/workspace/browser/fixtures/workspace.fixture.ts";
import {
  BROWSER_RENDERER,
  revisionManifestSchema,
} from "@theoryfoundry/contracts";

export async function mountWorkspaceJourney(
  page,
  width,
  parameterized = false,
  multiObject = false,
  legacyLibrary = false,
  editingPanels = false,
) {
  const historical = multiObject
    ? "difference() {\nunion() {\ncube([20,10,5]);\n}\nunion() {\ntranslate([5,2,-1]) cube([5,6,7]);\n}\n}"
    : "cube(10);";
  const accepted = multiObject
    ? "difference() {\nunion() {\ncube([20,10,5]);\n}\n}"
    : legacyLibrary
      ? "include <BOSL2/std.scad>; cuboid([2,4,6]);"
      : "cube(20);";
  const sources = { r1: historical, r2: accepted, r3: historical };
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
    releaseEdit: undefined,
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
        body: '<meta name="viewport" content="width=device-width, initial-scale=1"><div id="root"></div>',
      });
    const json = (value) => route.fulfill({ json: value });
    if (path === "/v1/readiness") return json({ ready: true });
    if (path === "/vendor/openscad/manifest.json")
      return json(BROWSER_RENDERER);
    if (path === "/v1/features/sidebar-chat")
      return json({ isSidebarChatEnabled: false });
    if (path === "/v1/ai/connections") return json({ connections: [] });
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
    const panelRequest = ["/layers", "/objects", "/parameters"].some((suffix) =>
      path.endsWith(suffix),
    );
    if (editingPanels && panelRequest && request.method() === "POST") {
      await new Promise((resolve) => {
        controls.releaseEdit = resolve;
      });
      const input = request.postDataJSON();
      return route.fulfill({
        contentType: "application/x-ndjson",
        body:
          JSON.stringify({
            requestId: input.requestId,
            sessionId: input.sessionId,
            sequence: 0,
            type: "error",
            error: {
              code: "MODEL_REJECTED",
              message: "Fixture validation rejected this edit.",
            },
          }) + "\n",
      });
    }
    const modelFiles = {
      version: 2,
      files: [{ id: "main-file", name: "Main source file", body: "cube(20);" }],
      objects: [
        {
          id: "main-object",
          name: "Main object with a deliberately long descriptive name",
          fileId: "main-file",
        },
      ],
      composition: { operation: "union", objectIds: ["main-object"] },
      presentation: {
        fileOrder: ["main-file"],
        objectOrder: ["main-object"],
        hiddenFileIds: [],
        hiddenObjectIds: [],
      },
    };
    if (path.endsWith("/layers")) {
      const id =
        new URL(request.url()).searchParams.get("revision") ?? controls.current;
      const exportLayers = {
        version: 2,
        files: [
          { id: "body-file", name: "Body.scad" },
          { id: "cut-file", name: "Cut.scad" },
        ],
        objects: [
          { id: "body", name: "Body", fileId: "body-file" },
          { id: "cut", name: "Cut", fileId: "cut-file" },
        ],
        composition: { operation: "difference", objectIds: ["body", "cut"] },
        presentation: {
          objectOrder: ["body", "cut"],
          fileOrder: ["body-file", "cut-file"],
          hiddenFileIds: [],
          hiddenObjectIds: id === "r2" ? ["cut"] : [],
        },
      };
      return json({
        revision: id,
        sourceHash: revisions.find((r) => r.revisionId === id).sourceHash,
        state: multiObject
          ? exportLayers
          : editingPanels
            ? {
                ...modelFiles,
                files: modelFiles.files.map(({ id, name }) => ({ id, name })),
              }
            : null,
      });
    }
    if (path.endsWith("/objects")) {
      const id =
        new URL(request.url()).searchParams.get("revision") ?? controls.current;
      return json({
        revision: id,
        sourceHash: revisions.find((r) => r.revisionId === id).sourceHash,
        modelFiles: editingPanels ? modelFiles : null,
        parameters: [],
        ...(legacyLibrary
          ? {
              unsupportedReason:
                "Object editing is unavailable for this legacy model. BOSL2 include/use imports require source or AI editing. Your saved model, preview and downloads remain available.",
            }
          : {}),
      });
    }
    if (path.endsWith("/parameters")) {
      const id =
        new URL(request.url()).searchParams.get("revision") ?? controls.current;
      return json({
        revision: id,
        sourceHash: revisions.find((r) => r.revisionId === id).sourceHash,
        editable: parameterized || editingPanels,
        parameters: editingPanels
          ? Array.from({ length: 8 }, (_, index) => ({
              id: `size${index}`,
              binding: `size${index}`,
              label:
                index === 0
                  ? "Assembly magnetic clearance with a long descriptive label"
                  : `Dimension ${index}`,
              type: "number",
              value: 2,
              defaultValue: 2,
              min: 0.5,
              max: 5,
              step: 0.25,
              unit: "mm",
            }))
          : parameterized
            ? [
                {
                  id: "width",
                  binding: "width",
                  label: "Width",
                  type: "number",
                  value: id === "r2" ? 20 : 10,
                  defaultValue: 10,
                  min: 1,
                  max: 100,
                  step: 1,
                  control: "slider",
                },
              ]
            : [],
      });
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
      contents: `import React from 'react'; import {createRoot} from 'react-dom/client'; import {ModelWorkspace} from './src/features/workspace/browser/components/modelWorkspace.component'; import {BrowserRendererContext} from './src/features/browser-rendering/browser/index'; const renderer={cachedPreview:()=>new TextEncoder().encode('solid test\\nfacet normal 0 0 1\\nouter loop\\nvertex 0 0 0\\nvertex 10 0 0\\nvertex 0 20 0\\nendloop\\nendfacet\\nendsolid test'),generateDownload:async(source,format)=>{window.generatedSource=source;return {bytes:new TextEncoder().encode(source),extension:format,mimeType:'application/octet-stream'}}}; createRoot(document.getElementById('root')).render(<BrowserRendererContext.Provider value={renderer}><ModelWorkspace projectId="sample"/></BrowserRendererContext.Provider>);`,
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
              : `import {useEffect} from 'react';export default function dynamic(){return function Viewer({revisionId,onLoadStateChange}){useEffect(()=>onLoadStateChange('ready'),[revisionId,onLoadStateChange]);return <div className="viewer-shell" aria-label="Preview fixture">{revisionId}</div>}}`,
          }));
        },
      },
    ],
  });
  await page.setViewportSize({ width, height: 900 });
  await page.goto("https://example.test/projects/sample");
  await page.addStyleTag({ content: await applicationStyles() });
  await page.addScriptTag({ content: result.outputFiles[0].text });
  return { controls, errors, sources };
}
