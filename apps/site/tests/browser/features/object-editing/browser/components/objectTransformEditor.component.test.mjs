/* global window, requestAnimationFrame */
import assert from "node:assert/strict";
import { build } from "esbuild";
import { expect } from "playwright/test";
import { PerspectiveCamera, Vector3 } from "three";
import { test, root, applicationStyles } from "../../../../browser.fixture.mjs";

async function mount(page, strict = false) {
  const contents = `import React,{StrictMode,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {BoxGeometry,Mesh} from 'three';
import {STLExporter} from 'three/addons/exporters/STLExporter.js';
import {ModelViewer} from './src/features/model-preview/browser/index';
import {ObjectTransformEditor} from './src/features/object-editing/browser/components/objectTransformEditor.component';
import {ObjectTransformScene} from './src/features/object-editing/browser/components/objectTransformScene.component';
import {transformedObjectDimensions} from './src/features/object-editing/browser/utils/objectGeometry.util';
import {BrowserRendererContext} from './src/features/browser-rendering/browser/index';
const geometry = new BoxGeometry(10,20,30);
const meshes = new Map([['test-file',geometry]]);
const bytes = new TextEncoder().encode(new STLExporter().parse(new Mesh(geometry)));
const renderer = {cachedPreview:()=>bytes};
function App(){
  const [transform,setTransform]=useState({position:[0,0,0],rotation:[0,0,0],scale:[1,1,1]});
  const [valid,setValid]=useState(true);
  const [mode,setMode]=useState('translate');
  const [ready,setReady]=useState('loading');
  window.transform=transform;
  const [x,y,z]=transformedObjectDimensions(geometry,transform).map(value=>value.toFixed(3));
  return <BrowserRendererContext.Provider value={renderer}><main className="editor-stage">
    <div className="editor-tool-panel">
      <ObjectTransformEditor objectName="Test block" mode={mode} setMode={setMode} transform={transform} disabled={false} onChange={setTransform} onValidityChange={setValid}/>
      <button disabled={!valid}>Apply test</button>
    </div>
    <div className="editor-viewport">
      <ModelViewer projectId="test" revisionId="r1" sourceHash={'a'.repeat(64)} currentLabel="R1" updating={false} onLoadStateChange={setReady} showAccepted={false} renderEditingScene={orbit=>
        <ObjectTransformScene meshes={meshes} objects={[{id:'box',fileId:'test-file',name:'Test block',transform}]} selectedId="box" showOperands mode={mode} disabled={false} orbit={orbit} onSelect={()=>{}} onChange={setTransform} onError={()=>{}}/>
      }/>
    </div>
    {ready==='ready' && <p>Object bounds · X {x} mm · Y {y} mm · Z {z} mm</p>}
  </main></BrowserRendererContext.Provider>
}
createRoot(document.getElementById('root')).render(${strict ? "<StrictMode><App/></StrictMode>" : "<App/>"});`;
  const bundle = await build({
    stdin: { contents, resolveDir: root + "/apps/site", loader: "tsx" },
    bundle: true,
    write: false,
    jsx: "automatic",
  });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("https://example.test/**", (route) =>
    route.fulfill({ contentType: "text/html", body: '<div id="root"></div>' }),
  );
  await page.goto("https://example.test/project");
  await page.addStyleTag({ content: await applicationStyles() });
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
  await expect(
    page.getByText("Object bounds · X 10.000 mm · Y 20.000 mm · Z 30.000 mm"),
  ).toBeVisible();
  return errors;
}

test("numeric transforms validate all axes and report rotated/scaled bounds", async ({
  page,
}) => {
  const errors = await mount(page);
  await page.getByRole("textbox", { name: "Position X · mm" }).fill("12");
  assert.deepEqual(
    await page.evaluate(() => window.transform.position),
    [12, 0, 0],
  );
  await page.getByRole("button", { name: "Rotate", exact: true }).click();
  await page.getByRole("textbox", { name: "Rotation Z · degrees" }).fill("90");
  await expect(
    page.getByText("Object bounds · X 20.000 mm · Y 10.000 mm · Z 30.000 mm"),
  ).toBeVisible();
  await page.getByRole("button", { name: "Scale", exact: true }).click();
  await page.getByRole("textbox", { name: "Scale X · factor" }).fill("0");
  await expect(page.getByRole("button", { name: "Apply test" })).toBeDisabled();
  await page.getByRole("textbox", { name: "Scale Y · factor" }).fill("3");
  await expect(page.getByRole("button", { name: "Apply test" })).toBeDisabled();
  assert.deepEqual(
    await page.evaluate(() => window.transform.scale),
    [1, 1, 1],
  );
  await page.getByRole("textbox", { name: "Scale X · factor" }).fill("2");
  await expect(page.getByRole("button", { name: "Apply test" })).toBeEnabled();
  assert.deepEqual(
    await page.evaluate(() => window.transform.scale),
    [2, 3, 1],
  );
  await expect(
    page.getByText("Object bounds · X 60.000 mm · Y 20.000 mm · Z 30.000 mm"),
  ).toBeVisible();
  await page.getByRole("textbox", { name: "Uniform scale factor" }).fill("4");
  assert.deepEqual(
    await page.evaluate(() => window.transform.scale),
    [4, 4, 4],
  );
  await page
    .getByRole("textbox", { name: "Scale Z · factor" })
    .fill("Infinity");
  await expect(page.getByRole("button", { name: "Apply test" })).toBeDisabled();
  assert.deepEqual(errors, []);
});

async function drag(page, from, to) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 8 });
  await page.mouse.up();
}

async function projection(page) {
  const canvas = page.getByTestId("model-viewer").locator("canvas");
  await expect(canvas).toHaveCount(1);
  await page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ),
  );
  const box = await canvas.boundingBox();
  assert.ok(box);
  // Match the fitted camera and handle size for the centered 10 × 20 × 30 fixture.
  const radius = new Vector3(5, 10, 15).length();
  const camera = new PerspectiveCamera(42, box.width / box.height);
  camera.up.set(0, 0, 1);
  camera.position.set(1.65, -1.65, 1.25).multiplyScalar(radius);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  const scale =
    (camera.position.length() *
      1.9 *
      Math.tan((Math.PI * camera.fov) / 360) *
      0.85) /
    4;
  return ([x, y, z]) => {
    const point = new Vector3(x, y, z).multiplyScalar(scale).project(camera);
    return {
      x: box.x + ((point.x + 1) * box.width) / 2,
      y: box.y + ((1 - point.y) * box.height) / 2,
    };
  };
}

test("dragging the scene background changes only the camera", async ({
  page,
}) => {
  const errors = await mount(page);
  const canvas = page.locator("canvas");
  const box = await canvas.boundingBox();
  assert.ok(box);
  const before = await canvas.screenshot();
  await drag(
    page,
    { x: box.x + 30, y: box.y + 30 },
    { x: box.x + 80, y: box.y + 60 },
  );
  const after = await canvas.screenshot();
  assert.notDeepEqual(after, before);
  assert.deepEqual(await page.evaluate(() => window.transform), {
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
  });
  assert.deepEqual(errors, []);
});

for (const strict of [false, true])
  test(`dragging the move handle edits the selected object position${strict ? " in StrictMode" : ""}`, async ({
    page,
  }) => {
    const errors = await mount(page, strict);
    await page.getByRole("button", { name: "Fit model", exact: true }).click();
    const project = await projection(page);
    await drag(page, project([0, 0, 0.45]), project([0, 0, 0.85]));
    await expect
      .poll(async () =>
        Math.abs(await page.evaluate(() => window.transform.position[2])),
      )
      .toBeGreaterThan(1);
    const transform = await page.evaluate(() => window.transform);
    assert.ok(Math.abs(transform.position[0]) < 0.001);
    assert.ok(Math.abs(transform.position[1]) < 0.001);
    assert.deepEqual(transform.rotation, [0, 0, 0]);
    assert.deepEqual(transform.scale, [1, 1, 1]);
    assert.deepEqual(errors, []);
  });

for (const scenario of [
  {
    mode: "Rotate",
    start: [0.5, 0, 0],
    end: [0.36, 0.36, 0],
    field: "rotation",
  },
  { mode: "Scale", start: [0.42, 0, 0], end: [0.85, 0, 0], field: "scale" },
  {
    mode: "Scale",
    start: [0.025, 0.035, 0],
    end: [0.09, 0.108, 0],
    field: "uniform",
  },
])
  test(`dragging ${scenario.field} handles updates numeric values`, async ({
    page,
  }) => {
    const errors = await mount(page);
    await page
      .getByRole("button", { name: scenario.mode, exact: true })
      .click();
    const project = await projection(page);
    await drag(page, project(scenario.start), project(scenario.end));
    const transform = await page.evaluate(() => window.transform);
    assert.deepEqual(transform.position, [0, 0, 0]);
    if (scenario.field === "rotation") {
      assert.ok(Math.abs(transform.rotation[2]) > 1, JSON.stringify(transform));
      assert.deepEqual(transform.scale, [1, 1, 1]);
    } else {
      assert.ok(
        Math.abs(transform.scale[0] - 1) > 0.1,
        JSON.stringify(transform),
      );
      assert.deepEqual(transform.rotation, [0, 0, 0]);
      if (scenario.field === "uniform") {
        assert.ok(Math.abs(transform.scale[0] - transform.scale[1]) < 0.001);
        assert.ok(Math.abs(transform.scale[1] - transform.scale[2]) < 0.001);
      } else assert.deepEqual(transform.scale.slice(1), [1, 1]);
    }
    assert.deepEqual(errors, []);
  });
