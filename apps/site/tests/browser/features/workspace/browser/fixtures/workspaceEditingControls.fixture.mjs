import { build } from "esbuild";
import { root, applicationStyles } from "../../../../browser.fixture.mjs";

export async function mountWorkspaceEditingControls(page) {
  const modelFiles = {
    version: 2,
    files: [
      { id: "body-file", name: "Body file", body: "cube(width);" },
      { id: "lid-file", name: "Lid file", body: "cube([10,20,2]);" },
    ],
    objects: [
      { id: "body", name: "Body", fileId: "body-file" },
      { id: "lid", name: "Lid", fileId: "lid-file" },
    ],
    composition: { operation: "union", objectIds: ["body", "lid"] },
    presentation: {
      fileOrder: ["body-file", "lid-file"],
      objectOrder: ["body", "lid"],
      hiddenFileIds: [],
      hiddenObjectIds: [],
    },
  };
  const parameters = [
    {
      id: "width",
      binding: "width",
      label: "Width",
      type: "number",
      value: 10,
      defaultValue: 10,
      unit: "mm",
    },
  ];
  const common = { revision: "r1", sourceHash: "a".repeat(64) };
  const state = {
    ...modelFiles,
    files: modelFiles.files.map(({ id, name }) => ({ id, name })),
  };
  const snapshots = {
    objects: { ...common, modelFiles, parameters },
    layers: { ...common, state },
    parameters: { ...common, editable: true, parameters },
  };
  const controls = { requests: [], release: undefined };
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/*", async (route) => {
    const request = route.request();
    if (request.isNavigationRequest())
      return route.fulfill({
        contentType: "text/html",
        body: '<div id="root"></div>',
      });
    const endpoint = new URL(request.url()).pathname.split("/").at(-1);
    if (request.method() === "GET")
      return route.fulfill({ json: snapshots[endpoint] });
    const input = request.postDataJSON();
    controls.requests.push({ endpoint, input });
    await new Promise((resolve) => {
      controls.release = resolve;
    });
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
            message: `${endpoint} fixture validation failed.`,
          },
        }) + "\n",
    });
  });
  const result = await build({
    stdin: {
      contents: `import React,{useState} from 'react';import {createRoot} from 'react-dom/client';import {WorkspaceEditingControls} from './src/features/workspace/browser/components/workspaceEditingControls.component';import {BrowserRendererContext} from './src/features/browser-rendering/browser/index';
const bytes=new TextEncoder().encode('solid test\\nfacet normal 0 0 1\\nouter loop\\nvertex 0 0 0\\nvertex 10 0 0\\nvertex 0 20 0\\nendloop\\nendfacet\\nendsolid test');const renderer={cachedPreview:()=>bytes};
function App(){const [pending,setPending]=useState(false);return <BrowserRendererContext.Provider value={renderer}><main><p>Workspace operation: {pending?'pending':'idle'}</p><WorkspaceEditingControls projectId="project" currentRevision="r1" selectedRevision="r1" sessionId="session" disabled={false} acquire={async()=>true} release={()=>{}} render={async()=>{}} refresh={async()=>true} onPending={setPending}/></main></BrowserRendererContext.Provider>};createRoot(document.getElementById('root')).render(<App/>);`,
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
  await page
    .getByRole("textbox", { name: "Position X · mm", exact: true })
    .waitFor();
  await page
    .getByRole("textbox", { name: "Width · mm", exact: true })
    .waitFor();
  await page
    .getByRole("checkbox", { name: "Show Lid (lid)", exact: true })
    .waitFor();
  return { controls, errors };
}
