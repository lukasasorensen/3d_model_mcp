/* global window */
import { expect } from "playwright/test";
import { build } from "esbuild";
import { test, root, applicationStyles } from "../../../../browser.fixture.mjs";

test("workspace notifications float, dismiss, and expire", async ({ page }) => {
  const result = await build({
    stdin: {
      contents: `import React from 'react';import {createRoot} from 'react-dom/client';import {WorkspaceStatusToast} from './src/features/workspace/browser/components/workspaceStatusToast.component';const root=createRoot(document.getElementById('root'));window.show=(message)=>root.render(<div className="workspace-toasts"><WorkspaceStatusToast key={message} message={message}/></div>);window.show('Working');`,
      resolveDir: root + "/apps/site",
      loader: "tsx",
    },
    bundle: true,
    write: false,
    jsx: "automatic",
  });
  await page.clock.install();
  await page.setContent(
    `<style>${await applicationStyles()}</style><div id="root"></div>`,
  );
  await page.addScriptTag({ content: result.outputFiles[0].text });
  await expect(page.getByRole("status")).toHaveText("Working");
  await expect(page.locator(".workspace-toasts")).toHaveCSS(
    "position",
    "fixed",
  );
  await page.getByRole("button", { name: "Dismiss notification" }).click();
  await expect(page.getByRole("status")).toHaveCount(0);
  await page.evaluate(() => window.show("Ready"));
  await expect(page.getByRole("status")).toHaveText("Ready");
  await page.clock.fastForward(8000);
  await expect(page.getByRole("status")).toHaveCount(0);
});
