import assert from "node:assert/strict";
import { build } from "esbuild";
import { chromium } from "playwright";
import { readFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createCadToolRegistry, invokeCadTool } from "@theoryfoundry/mcp";
import { parseBinaryStl, parseThreeMf } from "@theoryfoundry/renderer";
import { createParameterControlsHandlers } from "../../apps/site/src/features/parameter-controls/index.ts";

/** Real controls and HTTP Apply with fixture authentication and pinned renderer geometry. */
export async function exerciseControlAcceptance(
  repository,
  renderer,
  projectId,
) {
  const root = new URL("../../", import.meta.url);
  const registry = createCadToolRegistry(repository);
  const context = { params: Promise.resolve({ projectId }) };
  const origin =
    process.env.THEORYFOUNDRY_ALLOWED_ORIGIN ?? "http://localhost:3000";
  const client = {
    async callTool(name, input, options) {
      const result = await invokeCadTool(registry, name, input, options);
      return result.ok
        ? { isError: false, structuredContent: result.value }
        : { isError: true, error: result.error };
    },
  };
  const handlers = createParameterControlsHandlers({
    authenticate: async () => ({ id: "acceptance-owner" }),
    withRuntime: async (_, run) =>
      run({ client, browserRenderer: { subscribe: () => () => {} } }),
  });
  const original = await repository.readModelSource(projectId);
  const source = `import React,{useState} from 'react';import {createRoot} from 'react-dom/client';import {ParameterPanel} from './src/features/parameter-controls/browser/components/parameterPanel.component';function App(){const [revision,setRevision]=useState(${JSON.stringify(original.revision)});return <ParameterPanel projectId=${JSON.stringify(projectId)} currentRevision={revision} selectedRevision={revision} sessionId="acceptance-session" disabled={false} acquire={async()=>true} release={()=>{}} render={async()=>{throw new Error('unexpected render handoff')}} onPending={()=>{}} refresh={async()=>{const s=await (await fetch('/fixture/current')).json();setRevision(s.revision);return true;}}/>};createRoot(document.getElementById('root')).render(<App/>);`;
  const bundle = await build({
    stdin: {
      contents: source,
      resolveDir: fileURLToPath(new URL("apps/site/", root)),
      loader: "tsx",
    },
    bundle: true,
    jsx: "automatic",
    write: false,
  });
  const browser = await chromium.launch({
    headless: true,
    chromiumSandbox: true,
  });
  const page = await browser.newPage({ viewport: { width: 900, height: 900 } });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  try {
    await page.route("**/*", async (route) => {
      const req = route.request();
      if (req.isNavigationRequest())
        return route.fulfill({
          contentType: "text/html",
          body: '<main id="root"></main>',
        });
      const url = new URL(req.url());
      if (url.pathname === "/fixture/current")
        return route.fulfill({
          json: await repository.readModelSource(projectId),
        });
      const request = new Request(`${origin}${url.pathname}${url.search}`, {
        method: req.method(),
        headers: { ...req.headers(), origin },
        ...(req.method() === "POST" ? { body: req.postData() } : {}),
      });
      const response = await handlers[req.method()](request, context);
      return route.fulfill({
        status: response.status,
        headers: Object.fromEntries(response.headers),
        body: await response.text(),
      });
    });
    await page.goto(`${origin}/acceptance`);
    const css = await readFile(
      new URL("apps/site/src/app/styles.css", root),
      "utf8",
    );
    const styles = await Promise.all(
      [...css.matchAll(/@import "(.+)"/g)].map((match) =>
        readFile(new URL(`apps/site/src/app/${match[1]}`, root), "utf8"),
      ),
    );
    await page.addStyleTag({ content: styles.join("\n") });
    await page.addScriptTag({ content: bundle.outputFiles[0].text });
    const input = page.getByRole("textbox", { name: "width", exact: true });
    await input.fill("45");
    assert.equal(
      (await repository.readModelSource(projectId)).revision,
      original.revision,
    );
    await page.getByRole("button", { name: "Apply changes" }).click();
    await page.getByText("Changes saved.", { exact: true }).waitFor();
    const document = await repository.readModelSource(projectId);
    assert.equal(document.parameters.find((p) => p.id === "width").value, 45);
    assert.equal(document.modelBody, original.modelBody);
    const bounds = {};
    for (const format of ["stl", "3mf"]) {
      const result = await renderer.render({
        source: document.source,
        sourceHash: document.sourceHash,
        format,
      });
      assert.equal(result.ok, true, JSON.stringify(result));
      bounds[format] = (format === "stl" ? parseBinaryStl : parseThreeMf)(
        Buffer.from(result.encoded, "base64"),
      ).boundingBox;
      assert.deepEqual(bounds[format], { min: [0, 0, 0], max: [45, 10, 5] });
    }
    await page.getByRole("button", { name: "Reset to defaults" }).click();
    assert.equal(await input.inputValue(), "30");
    assert.equal(
      (await repository.readModelSource(projectId)).revision,
      document.revision,
    );
    await page.getByRole("button", { name: "Apply changes" }).click();
    await page.getByRole("alert").waitFor();
    assert.equal(
      (await repository.readModelSource(projectId)).revision,
      document.revision,
    );
    // Independent scalar defaults can violate body assertions; discard then correct only width.
    await page.getByRole("button", { name: "Discard changes" }).click();
    await input.fill("30");
    await page.getByRole("button", { name: "Apply changes" }).click();
    await page.getByText("Changes saved.", { exact: true }).waitFor();
    assert.equal(
      (await repository.readModelSource(projectId)).parameters.find(
        (p) => p.id === "width",
      ).value,
      30,
    );
    assert.deepEqual(errors, []);
    await mkdir(new URL("dist/parameter-acceptance/", root), {
      recursive: true,
    });
    await page.screenshot({
      path: fileURLToPath(
        new URL("dist/parameter-acceptance/controls.png", root),
      ),
      fullPage: true,
    });
    return {
      path: "native controls → HTTP Apply → shared CAD tools → pinned renderer → promotion",
      fixtureAuthentication: true,
      bodyUnchanged: true,
      dragDoesNotSave: true,
      resetStagesDefaults: true,
      invalidDefaultCombinationRetainsAccepted: true,
      bounds,
    };
  } finally {
    await browser.close();
  }
}
