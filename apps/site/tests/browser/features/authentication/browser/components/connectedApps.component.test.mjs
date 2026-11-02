/* global window, document */
import { build } from "esbuild";
import { expect } from "playwright/test";
import { test, root, applicationStyles } from "../../../../browser.fixture.mjs";

for (const width of [1440, 390, 320]) {
  test(`connected apps revoke failure, retry and empty state at ${width}px`, async ({
    page,
  }) => {
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    let succeed = false;
    let release;
    let gate = Promise.resolve();
    const requests = [];
    await page.route("**/*", async (route) => {
      const request = route.request();
      if (request.isNavigationRequest())
        return route.fulfill({
          contentType: "text/html",
          body: '<main id="root" class="auth-shell"></main>',
        });
      expect(new URL(request.url()).pathname).toBe(
        "/v1/oauth/grants/grant%2Fone",
      );
      expect(request.method()).toBe("DELETE");
      requests.push(request.url());
      await gate;
      return route.fulfill({ status: succeed ? 204 : 500 });
    });
    const bundle = await build({
      stdin: {
        contents: `import React from 'react';import {createRoot} from 'react-dom/client';import {ConnectedApps} from './src/features/authentication/browser/components/connectedApps.component';window.refreshes=0;const root=createRoot(document.getElementById('root'));window.renderGrants=(grants,available)=>root.render(<ConnectedApps grants={grants} localWorkerAvailable={available} codexOrigin="https://example.test"/>);window.renderGrants([{id:'grant/one',name:'Codex workstation'},{id:'grant-two',name:'A'.repeat(160)}]);`,
        resolveDir: root + "/apps/site",
        loader: "tsx",
      },
      bundle: true,
      write: false,
      jsx: "automatic",
      plugins: [
        {
          name: "navigation-boundary",
          setup(b) {
            b.onResolve({ filter: /^next\/navigation$/ }, () => ({
              path: "navigation",
              namespace: "fixture",
            }));
            b.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({
              contents: `export function useRouter(){return {refresh(){window.refreshes++}}}`,
            }));
          },
        },
      ],
    });
    await page.setViewportSize({ width, height: 900 });
    await page.goto("https://example.test/settings/connected-apps");
    // Match the server page: the section itself is a direct child of auth-shell.
    await page.addStyleTag({
      content: await applicationStyles(),
    });
    await page.addScriptTag({ content: bundle.outputFiles[0].text });
    const revoke = page.getByRole("button", {
      name: "Revoke access for Codex workstation",
      exact: true,
    });
    await expect(revoke).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth,
      ),
    ).toBe(false);
    await page.screenshot({
      path: test.info().outputPath("connected-apps.png"),
      fullPage: true,
    });
    await revoke.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("alert")).toHaveText(
      "Access could not be revoked. Please retry.",
    );
    await expect(revoke).toBeEnabled();
    expect(await page.evaluate(() => window.refreshes)).toBe(0);
    succeed = true;
    gate = new Promise((resolve) => {
      release = resolve;
    });
    await revoke.click();
    await expect(
      page.getByRole("button", {
        name: "Revoking access for Codex workstation",
        exact: true,
      }),
    ).toBeDisabled();
    await expect(
      page.getByRole("button", { name: /^Revoke access for A/ }),
    ).toBeDisabled();
    release();
    await expect(page.getByRole("status")).toHaveText(
      "Access revoked for Codex workstation.",
    );
    await expect(revoke).toHaveCount(0);
    await expect(
      page.getByRole("heading", { name: "Connected apps", exact: true }),
    ).toBeFocused();
    await expect(page.getByRole("alert")).toHaveCount(0);
    expect(await page.evaluate(() => window.refreshes)).toBe(1);
    expect(requests).toHaveLength(2);
    await page
      .getByRole("button", { name: "Connect CAD tools", exact: true })
      .click();
    await page.keyboard.press("Escape");
    await expect(
      page.getByRole("button", { name: "Connect CAD tools", exact: true }),
    ).toBeFocused();
    for (const available of [true, false, undefined]) {
      await page.evaluate((value) => window.renderGrants([], value), available);
      await page
        .getByRole("button", { name: "Connect CAD tools", exact: true })
        .click();
      await expect(page.getByRole("radio")).toHaveCount(available ? 2 : 0);
      if (available) {
        await page.getByRole("radio", { name: /On your Mac/ }).check();
        await expect(page.getByLabel("Client", { exact: true })).toBeVisible();
      } else {
        await expect(page.getByLabel("Client", { exact: true })).toHaveCount(0);
      }
      const command = await page
        .getByLabel("Setup command", { exact: true })
        .inputValue();
      expect(command.includes("@tfoundry/local-worker")).toBe(
        Boolean(available),
      );
      await page.keyboard.press("Escape");
    }
    await page.evaluate(() => window.renderGrants([]));
    await expect(
      page.getByText("No connected apps.", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Back to projects" }),
    ).toHaveAttribute("href", "/projects");
    expect(errors).toEqual([]);
  });
}
