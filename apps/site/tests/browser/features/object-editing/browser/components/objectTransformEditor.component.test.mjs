/* global window */
import assert from "node:assert/strict";
import { build } from "esbuild";
import { expect } from "playwright/test";
import { test, root, applicationStyles } from "../../../../browser.fixture.mjs";

async function mount(page, strict = false) {
  const contents = `import React,{StrictMode,useState} from 'react';import {createRoot} from 'react-dom/client';import {BoxGeometry,Mesh} from 'three';import {STLExporter} from 'three/addons/exporters/STLExporter.js';import {ObjectTransformEditor} from './src/features/object-editing/browser/components/objectTransformEditor.component';import {BrowserRendererContext} from './src/features/browser-rendering/browser/index';const bytes=new TextEncoder().encode(new STLExporter().parse(new Mesh(new BoxGeometry(10,20,30))));const renderer={cachedPreview:()=>bytes,renderPreview:async()=>({bytes,diagnostics:[]})};function App(){const [transform,setTransform]=useState({position:[0,0,0],rotation:[0,0,0],scale:[1,1,1]});const [valid,setValid]=useState(true);window.transform=transform;return <BrowserRendererContext.Provider value={renderer}><main style={{width:600}}><ObjectTransformEditor objectName="Test block" source="cube([10,20,30],center=true);" transform={transform} onChange={setTransform} onValidityChange={setValid}/><button disabled={!valid}>Apply test</button></main></BrowserRendererContext.Provider>};createRoot(document.getElementById('root')).render(${strict ? "<StrictMode><App/></StrictMode>" : "<App/>"});`;
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

test("dragging the scene background changes only the camera", async ({
  page,
}) => {
  const errors = await mount(page);
  await page.waitForTimeout(300);

  const box = await page.locator("canvas").boundingBox();
  assert.ok(box);
  await page.mouse.move(box.x + 30, box.y + 30);
  await page.mouse.down();
  await page.mouse.move(box.x + 80, box.y + 60, { steps: 8 });
  await page.mouse.up();
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
    await page.locator("canvas").scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);
    const box = await page.locator("canvas").boundingBox();
    assert.ok(box);
    await page.mouse.move(box.x + box.width * 0.545, box.y + box.height * 0.54);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.64, box.y + box.height * 0.62, {
      steps: 8,
    });
    await page.mouse.up();
    const transform = await page.evaluate(() => window.transform);
    assert.ok(Math.abs(transform.position[0]) > 1, JSON.stringify(transform));
    assert.ok(Math.abs(transform.position[1]) < 0.001);
    assert.ok(Math.abs(transform.position[2]) < 0.001);
    assert.deepEqual(transform.rotation, [0, 0, 0]);
    assert.deepEqual(transform.scale, [1, 1, 1]);
    assert.deepEqual(errors, []);
  });

for (const scenario of [
  { mode: "Rotate", start: [0.5, 0.55], end: [0.55, 0.5], field: "rotation" },
  { mode: "Scale", start: [0.545, 0.54], end: [0.64, 0.62], field: "scale" },
  { mode: "Scale", start: [0.504, 0.506], end: [0.55, 0.6], field: "uniform" },
])
  test(`dragging ${scenario.field} handles updates numeric values`, async ({
    page,
  }) => {
    const errors = await mount(page);
    await page
      .getByRole("button", { name: scenario.mode, exact: true })
      .click();
    await page.locator("canvas").scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);
    const box = await page.locator("canvas").boundingBox();
    assert.ok(box);
    await page.mouse.move(
      box.x + box.width * scenario.start[0],
      box.y + box.height * scenario.start[1],
    );
    await page.mouse.down();
    await page.mouse.move(
      box.x + box.width * scenario.end[0],
      box.y + box.height * scenario.end[1],
      { steps: 8 },
    );
    await page.mouse.up();
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
