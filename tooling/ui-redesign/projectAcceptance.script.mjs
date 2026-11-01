/* global document, window, innerWidth */
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { chromium } from "playwright";
import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
const root = fileURLToPath(new URL("../../", import.meta.url));
const result = await build({
  stdin: {
    contents: `import React from 'react';import {createRoot} from 'react-dom/client';import {ProjectLanding} from './src/features/workspace/browser/components/projectLanding.component';const root=createRoot(document.getElementById('root'));window.renderProjects=(projects)=>root.render(<ProjectLanding projects={projects} userName="A long account name that should wrap on phones" remoteMcpEnabled/>);window.renderProjects([{projectId:'project/one',name:'Adjustable mounting bracket with a very long project name for the workshop',description:'A detailed description of the part and its revision history.'}]);`,
    resolveDir: root + "/apps/site",
    loader: "tsx",
  },
  bundle: true,
  write: false,
  jsx: "automatic",
  plugins: [
    {
      name: "local-stubs",
      setup(b) {
        b.onResolve({ filter: /^next\/navigation$/ }, () => ({
          path: "nav",
          namespace: "stub",
        }));
        b.onResolve({ filter: /authentication\/browser\/index$/ }, () => ({
          path: "auth",
          namespace: "stub",
        }));
        b.onLoad({ filter: /.*/, namespace: "stub" }, ({ path }) => ({
          contents:
            path === "nav"
              ? `export function useRouter(){return {push(path){window.navigationPath=path},replace(){},refresh(){}}}`
              : `export const authClient={signOut:async()=>{}}`,
        }));
      },
    },
  ],
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
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
  }
  assert.equal(
    await page.locator(".project-open").getAttribute("href"),
    "/projects/project%2Fone",
  );
  assert.equal(
    await page.getByText("Project ID", { exact: true }).isVisible(),
    false,
  );
  await page.locator(".project-details summary").focus();
  await page.keyboard.press("Enter");
  assert.equal(
    await page.getByText("Project ID", { exact: true }).isVisible(),
    true,
  );
  await page.getByRole("button", { name: "New project", exact: true }).click();
  await page.getByLabel("Project name", { exact: true }).fill("Bracket");
  await page.getByLabel("Description", { exact: true }).fill("A fixture");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  assert.equal(
    await page
      .getByRole("button", { name: "New project", exact: true })
      .evaluate((el) => el === document.activeElement),
    true,
  );
  await page.getByRole("button", { name: "New project", exact: true }).click();
  assert.equal(
    await page.getByLabel("Project name", { exact: true }).inputValue(),
    "Bracket",
  );
  await page.evaluate(() => {
    window.fetch = () =>
      new Promise((resolve) => {
        window.finishCreate = () =>
          resolve({ ok: false, json: async () => ({}) });
      });
  });
  await page
    .getByRole("button", { name: "Create project", exact: true })
    .click();
  assert.equal(
    await page.getByLabel("Project name", { exact: true }).isDisabled(),
    true,
  );
  await page.evaluate(() => window.finishCreate());
  await page.getByRole("alert").waitFor({ state: "visible" });
  assert.equal(
    await page.getByLabel("Project name", { exact: true }).inputValue(),
    "Bracket",
  );
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.evaluate(() => window.renderProjects([]));
  await page.getByText("Start your first model", { exact: true }).waitFor();
  console.log(
    "PASS: desktop/mobile layout, native link, keyboard disclosure, create/cancel focus, retained draft, pending/error behavior and empty state",
  );
} finally {
  await browser.close();
}
