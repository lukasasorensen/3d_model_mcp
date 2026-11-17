import { build } from "esbuild";
import { root, applicationStyles } from "../../../../browser.fixture.mjs";
export async function mountLayersPanel(page) {
  const state = {
    version: 2,
    files: [
      { id: "body-file", name: "body.scad" },
      { id: "lid-file", name: "lid.scad" },
    ],
    objects: [
      { id: "body", name: "Body", fileId: "body-file" },
      { id: "lid", name: "Lid", fileId: "lid-file" },
      { id: "spare", name: "Spare lid", fileId: "lid-file" },
    ],
    composition: { operation: "union", objectIds: ["body", "lid", "spare"] },
    presentation: {
      fileOrder: ["body-file", "lid-file"],
      objectOrder: ["body", "lid", "spare"],
      hiddenFileIds: [],
      hiddenObjectIds: [],
    },
  };
  const snapshot = (revision, model = state) => ({
    revision,
    sourceHash: (revision === "r1" ? "a" : "b").repeat(64),
    state: structuredClone(model),
  });
  const controls = {
    current: "r1",
    snapshots: { r1: snapshot("r1") },
    requests: [],
    mode: "success",
    release: undefined,
  };
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/*", async (route) => {
    const req = route.request();
    if (req.isNavigationRequest())
      return route.fulfill({
        contentType: "text/html",
        body: '<div id="root"></div>',
      });
    const url = new URL(req.url());
    if (url.pathname === "/fixture/current")
      return route.fulfill({ json: controls.snapshots[controls.current] });
    if (req.method() === "GET")
      return route.fulfill({
        json: controls.snapshots[
          url.searchParams.get("revision") ?? controls.current
        ],
      });
    const input = req.postDataJSON();
    controls.requests.push(input);
    const event = (sequence, value) =>
      JSON.stringify({
        requestId: input.requestId,
        sessionId: input.sessionId,
        sequence,
        ...value,
      });
    if (controls.mode === "hold") {
      await new Promise((resolve) => {
        controls.release = resolve;
      });
      return route
        .fulfill({
          contentType: "application/x-ndjson",
          body:
            event(0, {
              type: "error",
              error: { code: "CANCELLED", message: "Cancelled." },
            }) + "\n",
        })
        .catch(() => undefined);
    }
    if (controls.mode === "reject")
      return route.fulfill({
        contentType: "application/x-ndjson",
        body:
          event(0, {
            type: "error",
            error: {
              code: "MODEL_REJECTED",
              message: "Visible model cannot be validated.",
            },
          }) + "\n",
      });
    if (controls.mode === "lost")
      return route.fulfill({
        contentType: "application/x-ndjson",
        body: event(0, { type: "progress", stage: "proposing" }) + "\n",
      });
    const next = structuredClone(controls.snapshots[controls.current].state);
    for (const op of input.operations) {
      if (op.op === "set_file_visibility")
        next.presentation.hiddenFileIds =
          next.presentation.hiddenFileIds.filter((id) => id !== op.id);
      else if (op.op === "reorder_objects")
        next.presentation.objectOrder = op.ids;
      else if (op.visible)
        next.presentation.hiddenObjectIds =
          next.presentation.hiddenObjectIds.filter((id) => id !== op.id);
      else next.presentation.hiddenObjectIds.push(op.id);
    }
    const revision = `r${Object.keys(controls.snapshots).length + 1}`;
    controls.snapshots[revision] = snapshot(revision, next);
    controls.current = revision;
    return route.fulfill({
      contentType: "application/x-ndjson",
      body: event(0, { type: "saved", revision }) + "\n",
    });
  });
  const result = await build({
    stdin: {
      contents: `import React,{useState} from 'react';import{createRoot}from'react-dom/client';import{LayersPanel}from './src/features/object-layers/browser/components/layersPanel.component';function App(){const[revision,setRevision]=useState('r1');const[selected,setSelected]=useState('r1');const[key,setKey]=useState(0);const[pending,setPending]=useState(false);window.chooseRevision=setSelected;window.remount=()=>setKey(k=>k+1);window.refresh=async()=>{const s=await(await fetch('/fixture/current')).json();setRevision(s.revision);setSelected(s.revision);return true;};return <main><p>Preview: {revision}</p><p>Operation: {pending?'pending':'idle'}</p><LayersPanel key={key} projectId="project" currentRevision={revision} selectedRevision={selected} sessionId="session" disabled={false} acquire={async()=>true} release={()=>{}} render={async()=>{}} refresh={window.refresh} onPending={setPending}/></main>};createRoot(document.getElementById('root')).render(<App/>);`,
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
    .getByRole("button", { name: "Select Body (body)", exact: true })
    .waitFor();
  return { controls, errors, snapshot };
}
