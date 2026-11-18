/* global window */
import { build } from "esbuild";
import { root, applicationStyles } from "../../../../browser.fixture.mjs";

export async function mountObjectEditingPanel(
  page,
  { select = true, operandTriangles = 0 } = {},
) {
  const modelFiles = {
    version: 1,
    files: [{ id: "box-file", name: "Box file", body: "cube([10,20,5]);" }],
    objects: [{ id: "box", name: "Box", fileId: "box-file" }],
    composition: { operation: "union", objectIds: ["box"] },
  };
  const snapshot = (revision, files = modelFiles) => ({
    revision,
    modelFiles: structuredClone(files),
    parameters: [],
    sourceHash: "a".repeat(64),
  });
  const controls = {
    current: "r1",
    snapshots: { r1: snapshot("r1") },
    requests: [],
    mode: "success",
    applied: new Map(),
  };
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/*", async (route) => {
    const request = route.request();
    if (request.isNavigationRequest())
      return route.fulfill({
        contentType: "text/html",
        body: '<div id="root"></div>',
      });
    const url = new URL(request.url());
    if (request.method() === "GET")
      return route.fulfill({
        json: controls.snapshots[
          url.searchParams.get("revision") ?? controls.current
        ],
      });
    const input = request.postDataJSON();
    controls.requests.push(input);
    const event = (value) =>
      JSON.stringify({
        requestId: input.requestId,
        sessionId: input.sessionId,
        sequence: 0,
        ...value,
      }) + "\n";
    if (controls.mode === "reject")
      return route.fulfill({
        contentType: "application/x-ndjson",
        body: event({
          type: "error",
          error: {
            code: "MODEL_REJECTED",
            message: "Model validation rejected this edit.",
          },
        }),
      });
    let revision = controls.applied.get(input.requestId);
    if (!revision) {
      revision = `r${Object.keys(controls.snapshots).length + 1}`;
      controls.snapshots[revision] = snapshot(revision, input.modelFiles);
      controls.current = revision;
      controls.applied.set(input.requestId, revision);
    }
    return route.fulfill({
      contentType: "application/x-ndjson",
      body: event(
        controls.mode === "lost"
          ? { type: "progress", stage: "promoting" }
          : { type: "saved", revision },
      ),
    });
  });
  // Keep one triangle visible and the rest degenerate to avoid expensive raster overdraw.
  if (operandTriangles)
    await page.addInitScript((count) => {
      const bytes = new Uint8Array(84 + 50 * count);
      const view = new DataView(bytes.buffer);
      view.setUint32(80, count, true);
      const firstTriangle = 84;
      view.setFloat32(firstTriangle + 8, 1, true);
      view.setFloat32(firstTriangle + 24, 10, true);
      view.setFloat32(firstTriangle + 40, 20, true);
      window.operandPreviewBytes = bytes;
    }, operandTriangles);
  const result = await build({
    stdin: {
      contents: `import React,{useState} from 'react';import {createRoot} from 'react-dom/client';import {ObjectEditingPanel} from './src/features/object-editing/browser/components/objectEditingPanel.component';import {ModelViewer} from './src/features/model-preview/browser/index';import {BrowserRendererContext} from './src/features/browser-rendering/browser/index';
const bytes=new TextEncoder().encode('solid test\\nfacet normal 0 0 1\\nouter loop\\nvertex 0 0 0\\nvertex 10 0 0\\nvertex 0 20 0\\nendloop\\nendfacet\\nfacet normal 0 0 1\\nouter loop\\nvertex 10 0 0\\nvertex 10 20 0\\nvertex 0 20 0\\nendloop\\nendfacet\\nendsolid test');const renderer={cachedPreview:hash=>hash==="a".repeat(64)?bytes:(window.operandPreviewBytes??bytes)};
function App(){const [revision,setRevision]=useState('r1');const [selected,setSelected]=useState('r1');const [pending,setPending]=useState(false);window.chooseRevision=setSelected;window.refresh=async()=>{if(window.stallRefresh)return new Promise(()=>{});const next=await(await fetch('/fixture/current')).json();setRevision(next.revision);setSelected(next.revision);await new Promise(resolve=>setTimeout(resolve,0));return true;};return <BrowserRendererContext.Provider value={renderer}><main><p>Preview: {revision}</p><p>Operation: {pending?'pending':'idle'}</p><ObjectEditingPanel previewReady renderViewport={(editing)=><ModelViewer {...editing} projectId="project" revisionId={selected} sourceHash={'a'.repeat(64)} currentLabel={selected} updating={pending}/>} projectId="project" currentRevision={revision} selectedRevision={selected} sessionId="session" disabled={false} acquire={async()=>true} release={()=>{}} render={async()=>{}} refresh={window.refresh} onPending={setPending}/></main></BrowserRendererContext.Provider>};createRoot(document.getElementById('root')).render(<App/>);`,
      resolveDir: root + "/apps/site",
      loader: "tsx",
    },
    bundle: true,
    write: false,
    jsx: "automatic",
  });
  await page.goto("https://example.test/project");
  await page.addStyleTag({ content: await applicationStyles() });
  await page.addScriptTag({ content: result.outputFiles[0].text });
  const selector = page.getByRole("combobox", { name: "Selected object" });
  await selector.locator("option[value=box]").waitFor({ state: "attached" });
  if (select) {
    await selector.selectOption("box");
    await page
      .getByRole("textbox", { name: "Position X · mm", exact: true })
      .waitFor();
  }
  return { controls, errors, snapshot };
}
