import { build } from "esbuild";
import { root, applicationStyles } from "../../../../browser.fixture.mjs";

export async function mountParameterPanel(page) {
  const parameters = [
    {
      id: "width",
      binding: "width",
      label: "Width",
      description: "Outside width",
      type: "number",
      value: 20,
      defaultValue: 10,
      min: 1,
      max: 100,
      step: 1,
      control: "slider",
      unit: "mm",
    },
    {
      id: "count",
      binding: "count",
      label: "Count",
      type: "integer",
      value: 2,
      defaultValue: 1,
    },
    {
      id: "enabled",
      binding: "enabled",
      label: "Enabled",
      type: "boolean",
      value: true,
      defaultValue: false,
    },
    {
      id: "text",
      binding: "text",
      label: "Caption",
      type: "string",
      value: "line one\nline two",
      defaultValue: "雪",
    },
    {
      id: "style",
      binding: "style",
      label: "Style",
      type: "enum",
      value: 1,
      defaultValue: 2,
      options: [
        { label: "Plain", value: 1 },
        { label: "Rounded", value: 2 },
      ],
    },
  ];
  const snapshot = (revision, definitions = parameters) => ({
    revision,
    sourceHash: revision === "r1" ? "a".repeat(64) : "b".repeat(64),
    editable: true,
    parameters: definitions,
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
              code: "INVALID_PARAMETERS",
              message: "Width cannot produce this model.",
              details: { path: "parameters.width.value" },
            },
          }) + "\n",
      });
    if (controls.mode === "lost")
      return route.fulfill({
        contentType: "application/x-ndjson",
        body: event(0, { type: "progress", stage: "proposing" }) + "\n",
      });
    const revision = `r${Object.keys(controls.snapshots).length + 1}`;
    const next = controls.snapshots[controls.current].parameters.map((p) => ({
      ...p,
      value: input.operations.find((o) => o.id === p.id)?.value ?? p.value,
    }));
    controls.snapshots[revision] = snapshot(revision, next);
    controls.current = revision;
    return route.fulfill({
      contentType: "application/x-ndjson",
      body:
        [
          event(0, { type: "progress", stage: "validating" }),
          event(1, { type: "saved", revision }),
        ].join("\n") + "\n",
    });
  });
  const result = await build({
    stdin: {
      contents: `import React,{useState} from 'react';import {createRoot} from 'react-dom/client';import {ParameterPanel} from './src/features/parameter-controls/browser/components/parameterPanel.component';function App(){const [revision,setRevision]=useState('r1');const [selected,setSelected]=useState('r1');const [pending,setPending]=useState(false);window.chooseRevision=setSelected;window.refresh=async()=>{const s=await (await fetch('/fixture/current')).json();setRevision(s.revision);setSelected(s.revision);return true;};return <main><p>Preview: {revision}</p><p>Operation: {pending?'pending':'idle'}</p><ParameterPanel projectId="project" currentRevision={revision} selectedRevision={selected} sessionId="session" disabled={false} acquire={async()=>true} release={()=>{}} render={async()=>{}} refresh={window.refresh} onPending={setPending}/></main>};createRoot(document.getElementById('root')).render(<App/>);`,
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
    .getByRole("textbox", { name: "Width · mm", exact: true })
    .waitFor();
  return { controls, errors, snapshot };
}
