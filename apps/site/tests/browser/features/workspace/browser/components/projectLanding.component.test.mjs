/* global document, window, innerWidth */
import { expect } from "playwright/test";
import { mountProjectLanding } from "../fixtures/projectLanding.fixture.mjs";
import { build } from "esbuild";
import assert from "node:assert/strict";
import { test, root, applicationStyles } from "../../../../browser.fixture.mjs";

test("project selection and create form pending, failure and cancel states", async ({
  page,
}) => {
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
  const styles = await applicationStyles();
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
});

for (const width of [1440, 390]) {
  test(`project creation retry and successful navigation at ${width}px`, async ({
    page,
  }) => {
    const { controls, errors } = await mountProjectLanding(page, width);
    await page
      .getByRole("button", { name: "New project", exact: true })
      .click();
    const name = page.getByLabel("Project name", { exact: true });
    const description = page.getByLabel("Description", { exact: true });
    await expect(name).toBeFocused();
    await page
      .getByRole("button", { name: "Create project", exact: true })
      .click();
    expect(controls.requests).toHaveLength(0);
    await name.fill("  Bracket  ");
    await description.fill("  A fixture  ");
    for (const mode of ["failure", "malformed"]) {
      controls.createMode = mode;
      await page
        .getByRole("button", { name: "Create project", exact: true })
        .click();
      await expect(page.getByRole("alert")).toHaveText(
        "The project could not be created.",
      );
      await expect(name).toHaveValue("  Bracket  ");
      expect(await page.evaluate(() => window.navigation)).toEqual([]);
    }
    controls.createMode = "success";
    await name.focus();
    await page.keyboard.press("Enter");
    await expect
      .poll(() => page.evaluate(() => window.navigation))
      .toEqual([{ type: "push", path: "/projects/new-project" }]);
    expect(controls.requests).toHaveLength(3);
    for (const request of controls.requests)
      expect(request).toEqual({
        path: "/v1/projects",
        method: "POST",
        body: { name: "Bracket", description: "A fixture" },
      });
    await expect(page.getByRole("alert")).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test(`sign-out reports failures and navigates only after success at ${width}px`, async ({
    page,
  }) => {
    const { controls, errors } = await mountProjectLanding(page, width);
    for (const mode of ["failure", "network"]) {
      controls.signOutMode = mode;
      await page.getByRole("button", { name: "Sign out", exact: true }).click();
      await expect(page.getByRole("alert")).toHaveText(
        "Sign-out is temporarily unavailable. Please try again.",
      );
      expect(await page.evaluate(() => window.navigation)).toEqual([]);
      await expect(
        page.getByRole("button", { name: "Sign out", exact: true }),
      ).toBeEnabled();
    }
    controls.signOutMode = "success";
    let finishSignOut;
    controls.signOutGate = new Promise((resolve) => {
      finishSignOut = resolve;
    });
    await page.getByRole("button", { name: "Sign out", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Signing out…", exact: true }),
    ).toBeDisabled();
    await expect(
      page.getByRole("button", { name: "New project", exact: true }),
    ).toBeDisabled();
    expect(await page.evaluate(() => window.navigation)).toEqual([]);
    finishSignOut();
    await expect
      .poll(() => page.evaluate(() => window.navigation))
      .toEqual([{ type: "replace", path: "/sign-in" }, { type: "refresh" }]);
    await expect(page.getByRole("alert")).toHaveCount(0);
    expect(errors).toEqual([]);
  });
}
