/* global document, window */
import assert from "node:assert/strict";
import { build } from "esbuild";
import { test, root } from "../../../../browser.fixture.mjs";

test("hidden model preview becomes ready and displays when revealed", async ({
  page,
}) => {
  const contents = `import React from 'react';import {createRoot} from 'react-dom/client';import {ModelViewer} from './src/features/model-preview/browser/components/modelViewer.component';import {BrowserRendererContext} from './src/features/browser-rendering/browser/index';const bytes=new TextEncoder().encode('solid test\\nfacet normal 0 0 1\\nouter loop\\nvertex 0 0 0\\nvertex 10 0 0\\nvertex 0 10 0\\nendloop\\nendfacet\\nendsolid test');const renderer={cachedPreview:()=>bytes};createRoot(document.getElementById('root')).render(<BrowserRendererContext.Provider value={renderer}><ModelViewer projectId="sample" revisionId="r1" sourceHash="sample" currentLabel="R1" updating={false} onLoadStateChange={s=>window.previewState=s}/></BrowserRendererContext.Provider>);`;
  const r = await build({
    stdin: { contents, resolveDir: root + "/apps/site", loader: "tsx" },
    bundle: true,
    write: false,
    jsx: "automatic",
  });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setContent(
    '<style>#root{display:none}.viewer-shell{position:relative;width:600px;height:400px}.viewer-canvas{position:absolute;inset:0}</style><div id="root"></div>',
  );
  await page.addScriptTag({ content: r.outputFiles[0].text });
  await page.waitForFunction(() => window.previewState === "ready");
  console.log(
    "Hidden initial viewer:",
    await page.evaluate(() => window.previewState),
  );
  await page.evaluate(
    () => (document.getElementById("root").style.display = "block"),
  );
  await page.waitForFunction(() => window.previewState === "ready");
  await page.waitForFunction(() => document.querySelector("canvas")?.width > 0);
  assert.deepEqual(errors, []);
  console.log("Shown viewer:", await page.evaluate(() => window.previewState));
});
