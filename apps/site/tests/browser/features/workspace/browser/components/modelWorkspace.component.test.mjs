/* global document, window, requestAnimationFrame */
import assert from "node:assert/strict";
import { build } from "esbuild";
import { test, root, applicationStyles } from "../../../../browser.fixture.mjs";

test("workspace focus, responsive sections and integrated connection setup", async ({
  page,
}) => {
  const result = await build({
    stdin: {
      contents: `import React from 'react'; import {createRoot} from 'react-dom/client'; import {ModelWorkspace} from './src/features/workspace/browser/components/modelWorkspace.component'; const root=createRoot(document.getElementById('root'));window.renderConnection=(available,remote=true)=>root.render(<ModelWorkspace projectId="sample" remoteMcpEnabled={remote} localWorkerAvailable={available} codexOrigin="https://example.test"/>);window.renderConnection();`,
      resolveDir: root + "/apps/site",
      loader: "tsx",
    },
    bundle: true,
    write: false,
    jsx: "automatic",
    plugins: [
      {
        name: "preview-fixtures",
        setup(b) {
          b.onLoad({ filter: /useModelWorkspace\.hook\.ts$/ }, () => ({
            loader: "ts",
            contents: `import {useState,useRef} from 'react'; export function useModelWorkspace(){const [chatCollapsed,setChatCollapsed]=useState(false);const [exportFormat,setExportFormat]=useState('stl');const [exportState,setExportState]=useState('idle');return {router:{push(){}},isSidebarChatEnabled:true,state:{revisions:[],turns:[],selectedRevision:null,currentRevision:null,active:false},dispatch(){},readiness:'ready',exportState,setExportState,exportFormat,setExportFormat,projects:[{projectId:'sample',name:'Long project name — adjustable mounting bracket for workshop equipment'}],chatCollapsed,setChatCollapsed,restorePending:false,previewLoadState:'error',setPreviewLoadState(){},abortRef:useRef(null),composerRef:useRef(null),lastMessage:useRef(''),sessionId:'sample',isMcpRendering:false,submit(){},restore(){},currentLabel:'No revision',selectedLabel:'No revision',promotionPending:false,dimensions:'—',readinessLabel:'Ready',currentBadgeLabel:'No current revision',exportCurrent(){}}}`,
          }));
          b.onResolve({ filter: /^next\/dynamic$/ }, () => ({
            path: "dynamic",
            namespace: "fixture",
          }));
          b.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({
            resolveDir: root + "/apps/site",
            loader: "tsx",
            contents: `import React from 'react'; export default function dynamic(){return function Viewer(){return <div className="viewer-shell"><div className="empty-model"><h2>No model yet</h2><p>Create a model to begin inspecting it.</p></div></div>}}`,
          }));
        },
      },
    ],
  });
  const styles = await applicationStyles();
  await page.setContent(
    "<html><head><style>" +
      styles +
      '</style></head><body><div id="root"></div></body></html>',
  );
  await page.addScriptTag({ content: result.outputFiles[0].text });
  assert.equal(
    await page
      .getByRole("combobox", { name: "Project selector", exact: true })
      .count(),
    1,
  );
  assert.equal(
    await page.locator(".brand-mark strong").textContent(),
    "3d AI MCP Server | TheoryFoundry",
  );
  await page.setViewportSize({ width: 390, height: 844 });
  const nav = page.getByRole("navigation", { name: "Workspace sections" });
  await nav.getByRole("button", { name: "Details", exact: true }).click();
  // Let the section change finish its scheduled focus restoration first.
  await page.evaluate(() => new Promise(requestAnimationFrame));
  await page.getByRole("button", { name: "View model", exact: true }).focus();
  await page.keyboard.press("Enter");
  await page.waitForFunction(
    () => document.activeElement.id === "workspace-model-button",
  );
  console.log(
    "Focus after error recovery:",
    await page.evaluate(() => ({
      tag: document.activeElement.tagName,
      text: document.activeElement.textContent?.slice(0, 50),
    })),
  );
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByRole("textbox").focus();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForFunction(
    () => document.activeElement.id === "workspace-model-button",
  );
  console.log(
    "Focus after resize:",
    await page.evaluate(() => ({
      tag: document.activeElement.tagName,
      id: document.activeElement.id,
      visible: document.activeElement.getClientRects().length > 0,
    })),
  );
  // Exercise setup inside the workspace, where its dialog and panel focus interact.
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    if (width < 1024)
      await nav
        .getByRole("button", { name: "Conversation", exact: true })
        .click();
    const composer = page.getByRole("textbox");
    await composer.fill("Keep this draft while connecting CAD tools");
    await page
      .getByRole("button", { name: "Connect CAD tools", exact: true })
      .click();
    assert.match(
      await page.getByLabel("Starter prompt", { exact: true }).inputValue(),
      /sample/,
    );
    assert.equal(
      await page
        .locator("dialog")
        .evaluate((el) => el.scrollWidth > el.clientWidth),
      false,
    );
    await page.keyboard.press("Escape");
    await page.waitForFunction(
      () => document.activeElement?.textContent === "Connect CAD tools",
    );
    assert.equal(
      await composer.inputValue(),
      "Keep this draft while connecting CAD tools",
    );
    if (width < 1024) {
      await nav.getByRole("button", { name: "Details", exact: true }).click();
      await nav
        .getByRole("button", { name: "Conversation", exact: true })
        .click();
      assert.equal(
        await composer.inputValue(),
        "Keep this draft while connecting CAD tools",
      );
    }
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth,
      ),
      false,
    );
  }
  for (const width of [1440, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await page.screenshot({
      path: test.info().outputPath(`workspace-${width}.png`),
      fullPage: true,
    });
  }
  for (const available of [true, false, undefined]) {
    await page.evaluate((value) => window.renderConnection(value), available);
    await page
      .getByRole("button", { name: "Connect CAD tools", exact: true })
      .click();
    assert.equal(await page.getByRole("radio").count(), available ? 2 : 0);
    if (available)
      await page.getByRole("radio", { name: /On your Mac/ }).check();
    const command = await page
      .getByLabel(available ? "Setup command" : "Connection settings", {
        exact: true,
      })
      .inputValue();
    assert.equal(
      command.includes("@tfoundry/local-worker"),
      Boolean(available),
    );
    await page.keyboard.press("Escape");
  }
  await page.evaluate(() => window.renderConnection(true, false));
  await page
    .getByRole("button", { name: "Connect CAD tools", exact: true })
    .waitFor({ state: "detached" });
  console.log(
    "PASS: integrated workspace/setup at 1440/390/320px preserves draft, project context and dialog focus without overflow",
  );
  await page.emulateMedia({ forcedColors: "active", reducedMotion: "reduce" });
  const selected = page.locator('.workspace-sections [aria-pressed="true"]');
  assert.notEqual(
    await selected.evaluate((el) => window.getComputedStyle(el).outlineStyle),
    "none",
  );
  assert.ok(
    (await selected.evaluate((el) =>
      parseFloat(window.getComputedStyle(el).outlineWidth),
    )) >= 2,
  );
  assert.ok(
    (await selected.evaluate((el) =>
      parseFloat(window.getComputedStyle(el).transitionDuration),
    )) <= 0.00001,
  );
  console.log(
    "PASS: selected mobile section remains outlined in forced colors; reduced motion disables transitions",
  );
});
