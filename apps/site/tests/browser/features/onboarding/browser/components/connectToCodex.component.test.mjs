/* global document, window */
import { expect } from "playwright/test";
import { build } from "esbuild";
import assert from "node:assert/strict";
import { test, root, applicationStyles } from "../../../../browser.fixture.mjs";

test("connection setup choices, commands, clipboard and dialog navigation", async ({
  page,
}) => {
  const entry = `import React from 'react';import {createRoot} from 'react-dom/client';import {ConnectToCodex} from './src/features/onboarding/browser/components/connectToCodex.component';import {codexConnectCommand} from './src/features/onboarding/browser/utils/codexConnectCommand.util';import {localWorkerCommand} from './src/features/onboarding/browser/utils/localWorkerCommand.util';window.expected=(mode,client,scope)=>mode==='hosted'?codexConnectCommand('https://example.test',scope):localWorkerCommand('https://example.test',client,scope);createRoot(document.getElementById('root')).render(<ConnectToCodex origin="https://example.test" projectId="sample-project" localWorkerAvailable/>);`;
  const result = await build({
    stdin: { contents: entry, resolveDir: root + "/apps/site", loader: "tsx" },
    bundle: true,
    write: false,
    jsx: "automatic",
  });
  const styles = await applicationStyles();
  await page.setContent("<style>" + styles + '</style><div id="root"></div>');
  await page.addScriptTag({ content: result.outputFiles[0].text });
  await page
    .getByRole("button", { name: "Connect CAD tools", exact: true })
    .click();
  const close = page.getByRole("button", {
    name: "Close connection setup",
    exact: true,
  });
  await close.focus();
  const reached = new Set();
  for (const direction of ["Tab", "Shift+Tab"]) {
    for (let step = 0; step < 14; step++) {
      await page.keyboard.press(direction);
      const focus = await page.evaluate(() => ({
        // Native browser focus may leave the document, but never enter the inert page.
        contained:
          document.activeElement === document.body ||
          Boolean(document.activeElement?.closest("dialog[open]")),
        text: document.activeElement?.textContent,
      }));
      expect(focus.contained).toBe(true);
      reached.add(focus.text);
    }
  }
  expect(reached.has("Close")).toBe(true);
  expect(reached.has("Copy setup command")).toBe(true);
  await expect(
    page.getByRole("button", { name: "Continue to setup" }),
  ).toHaveCount(0);
  await expect(
    page.locator(".setup-starter details, details.setup-starter"),
  ).toHaveCount(0);
  await expect(
    page.getByLabel("Starter prompt", { exact: true }),
  ).toBeVisible();
  await expect(page.locator("dialog")).not.toContainText(
    /Keep (?:the|this) project tab|CODEX_HOME|backs up changed settings|Step 1 of 2/,
  );
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
        await page.getByLabel("Install for", { exact: true }).focus();
        await page
          .getByLabel("Install for", { exact: true })
          .selectOption(scope);
        await expect(
          page.getByLabel("Install for", { exact: true }),
        ).toBeFocused();
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
        assert.equal(
          await page.getByLabel("Install for", { exact: true }).inputValue(),
          scope,
        );
      }
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
  await expect(
    page.getByRole("heading", { name: "Connect CAD tools", exact: true }),
  ).toBeFocused();
  await expect(page.getByLabel("Install for", { exact: true })).toHaveValue(
    "project",
  );
  await expect(page.getByLabel("Client", { exact: true })).toHaveValue(
    "claude",
  );
  await page.getByLabel("Install for", { exact: true }).selectOption("global");
  await expect(page.getByText(/Clipboard unavailable/)).toHaveCount(0);
  console.log(
    "PASS: all six immediate command variants, selection focus, preserved choices, clipboard success/unavailable, starter prompt, Escape focus, reopen and responsive overflow",
  );
});

for (const available of [false, undefined]) {
  test(`browser-only dialog is accessible when availability is ${available}`, async ({
    page,
  }) => {
    const result = await build({
      stdin: {
        contents: `import React from 'react';import {createRoot} from 'react-dom/client';import {ConnectToCodex} from './src/features/onboarding/browser/components/connectToCodex.component';createRoot(document.getElementById('root')).render(<ConnectToCodex origin="https://example.test" projectId="sample-project" ${available === undefined ? "" : "localWorkerAvailable={false}"}/>);`,
        resolveDir: root + "/apps/site",
        loader: "tsx",
      },
      bundle: true,
      write: false,
      jsx: "automatic",
    });
    await page.setContent(
      "<style>" + (await applicationStyles()) + '</style><div id="root"></div>',
    );
    await page.addScriptTag({ content: result.outputFiles[0].text });
    const trigger = page.getByRole("button", {
      name: "Connect CAD tools",
      exact: true,
    });
    await trigger.focus();
    await page.keyboard.press("Enter");
    const dialog = page.getByRole("dialog", {
      name: "Set up browser rendering",
      exact: true,
    });
    await expect(dialog).toBeVisible();
    await expect(
      page.getByRole("heading", {
        name: "Set up browser rendering",
        exact: true,
      }),
    ).toBeFocused();
    await expect(dialog.getByRole("radio")).toHaveCount(0);
    await expect(dialog.getByLabel("Client", { exact: true })).toHaveCount(0);
    await expect(dialog).not.toContainText(
      /local worker|Claude|@tfoundry\/local-worker|On your Mac/i,
    );
    for (const scope of ["global", "project"]) {
      await page.getByLabel("Install for", { exact: true }).focus();
      await page.getByLabel("Install for", { exact: true }).selectOption(scope);
      await expect(
        page.getByLabel("Install for", { exact: true }),
      ).toBeFocused();
      const command = await page
        .getByLabel("Setup command", { exact: true })
        .inputValue();
      expect(command).toContain("npx --yes @tfoundry/connect-codex@0.2.0");
      expect(command).not.toContain("@tfoundry/local-worker");
      await expect(
        page.getByLabel("Starter prompt", { exact: true }),
      ).toHaveValue(/sample-project/);
      await expect(page.getByLabel("Install for", { exact: true })).toHaveValue(
        scope,
      );
    }
    await page
      .getByRole("button", { name: "Close connection setup", exact: true })
      .focus();
    for (const direction of ["Tab", "Shift+Tab"])
      for (let index = 0; index < 6; index++) {
        await page.keyboard.press(direction);
        expect(
          await page.evaluate(
            () =>
              document.activeElement === document.body ||
              Boolean(document.activeElement?.closest("dialog[open]")),
          ),
        ).toBe(true);
      }
    for (const width of [1440, 390, 320]) {
      await page.setViewportSize({ width, height: 844 });
      expect(
        await dialog.evaluate(
          (element) => element.scrollWidth > element.clientWidth,
        ),
      ).toBe(false);
      await page.screenshot({
        path: test.info().outputPath(`connection-${width}.png`),
        fullPage: true,
      });
    }
    await page.keyboard.press("Escape");
    await expect(trigger).toBeFocused();
    await trigger.click();
    await expect(dialog).toBeVisible();
    await page
      .getByRole("button", { name: "Close connection setup", exact: true })
      .click();
    await expect(trigger).toBeFocused();
  });
}
