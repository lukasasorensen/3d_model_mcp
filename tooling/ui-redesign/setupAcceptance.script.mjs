/* global document, window */
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { chromium } from "playwright";
import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
const root = fileURLToPath(new URL("../../", import.meta.url));
const entry = `import React from 'react';import {createRoot} from 'react-dom/client';import {ConnectToCodex} from './src/features/onboarding/browser/components/connectToCodex.component';import {codexConnectCommand} from './src/features/onboarding/browser/utils/codexConnectCommand.util';import {localWorkerCommand} from './src/features/onboarding/browser/utils/localWorkerCommand.util';window.expected=(mode,client,scope)=>mode==='hosted'?codexConnectCommand('https://example.test',scope):localWorkerCommand('https://example.test',client,scope);createRoot(document.getElementById('root')).render(<ConnectToCodex origin="https://example.test" projectId="sample-project"/>);`;
const result = await build({
  stdin: { contents: entry, resolveDir: root + "/apps/site", loader: "tsx" },
  bundle: true,
  write: false,
  jsx: "automatic",
});
let styles = "";
for (const [, p] of (
  await readFile(root + "/apps/site/src/app/styles.css", "utf8")
).matchAll(/@import "(.+)"/g))
  styles += await readFile(root + "/apps/site/src/app/" + p, "utf8");
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  await page.setContent("<style>" + styles + '</style><div id="root"></div>');
  await page.addScriptTag({ content: result.outputFiles[0].text });
  await page
    .getByRole("button", { name: "Connect CAD tools", exact: true })
    .click();
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    assert.equal(
      await page
        .locator("dialog")
        .evaluate((el) => el.scrollWidth > el.clientWidth),
      false,
    );
  }
  for (const mode of ["hosted", "local"])
    for (const client of mode === "hosted" ? ["codex"] : ["codex", "claude"])
      for (const scope of ["global", "project"]) {
        await page
          .getByRole("radio", {
            name: mode === "hosted" ? /In this browser/ : /On your Mac/,
          })
          .check();
        if (mode === "local")
          await page.getByLabel("Client", { exact: true }).selectOption(client);
        await page
          .getByLabel("Install for", { exact: true })
          .selectOption(scope);
        await page
          .getByRole("button", { name: "Continue to setup", exact: true })
          .click();
        await page.waitForFunction(
          () => document.activeElement?.textContent === "Install and authorize",
        );
        assert.equal(
          await page.getByLabel("Setup command", { exact: true }).inputValue(),
          await page.evaluate(
            ({ mode, client, scope }) => window.expected(mode, client, scope),
            { mode, client, scope },
          ),
        );
        assert.equal(
          await page
            .locator("dialog")
            .evaluate((el) => el.scrollWidth > el.clientWidth),
          false,
        );
        await page
          .getByRole("button", { name: "Change choices", exact: true })
          .click();
        await page.waitForFunction(
          () =>
            document.activeElement?.textContent === "Choose your connection",
        );
        assert.equal(
          await page.getByLabel("Install for", { exact: true }).inputValue(),
          scope,
        );
      }
  await page
    .getByRole("button", { name: "Continue to setup", exact: true })
    .click();
  await page.evaluate(() =>
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async (text) => {
          window.copied = text;
        },
      },
    }),
  );
  await page
    .getByRole("button", { name: "Copy setup command", exact: true })
    .click();
  await page.getByText("Setup command copied.", { exact: true }).waitFor();
  assert.equal(
    await page.evaluate(() => window.copied),
    await page.getByLabel("Setup command", { exact: true }).inputValue(),
  );
  await page.evaluate(() =>
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: undefined,
    }),
  );
  await page
    .getByRole("button", { name: "Copy setup command", exact: true })
    .click();
  await page.getByText(/Clipboard unavailable/).waitFor();
  await page.getByText("Start with this project", { exact: true }).click();
  assert.match(
    await page.getByLabel("Starter prompt", { exact: true }).inputValue(),
    /sample-project/,
  );
  const closeBounds = await page
    .getByRole("button", { name: "Close connection setup" })
    .boundingBox();
  const dialogBounds = await page.locator("dialog").boundingBox();
  assert.ok(closeBounds && dialogBounds);
  assert.ok(closeBounds.y >= dialogBounds.y);
  assert.ok(
    closeBounds.y + closeBounds.height <= dialogBounds.y + dialogBounds.height,
  );
  await page.keyboard.press("Escape");
  await page.waitForFunction(
    () => document.activeElement?.textContent === "Connect CAD tools",
  );
  await page
    .getByRole("button", { name: "Connect CAD tools", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "Choose your connection", exact: true })
    .waitFor();
  console.log(
    "PASS: all six command variants, step focus, preserved choices, clipboard success/unavailable, starter prompt, Escape focus, reopen and responsive overflow",
  );
} finally {
  await browser.close();
}
