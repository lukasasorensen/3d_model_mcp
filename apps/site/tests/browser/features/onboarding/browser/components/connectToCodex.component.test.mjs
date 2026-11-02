/* global document, window */
import { expect } from "playwright/test";
import { build } from "esbuild";
import assert from "node:assert/strict";
import { test, root, applicationStyles } from "../../../../browser.fixture.mjs";

test("connection setup choices, commands, clipboard and dialog navigation", async ({
  page,
}) => {
  const entry = `import React from 'react';import {createRoot} from 'react-dom/client';import {ConnectToCodex} from './src/features/onboarding/browser/components/connectToCodex.component';import {codexConnectCommand} from './src/features/onboarding/browser/utils/codexConnectCommand.util';import {nativeMcpConfiguration,nativeClaudeCommand} from './src/features/onboarding/browser/utils/nativeMcpConfiguration.util';import {localWorkerCommand} from './src/features/onboarding/browser/utils/localWorkerCommand.util';window.expected=(mode,client,scope)=>mode==='hosted'?(client==='claude'&&scope==='global'?nativeClaudeCommand('https://example.test'):nativeMcpConfiguration('https://example.test',client)):localWorkerCommand('https://example.test',client,scope);createRoot(document.getElementById('root')).render(<ConnectToCodex origin="https://example.test" projectId="sample-project" localWorkerAvailable installations={{origin:"https://example.test",codex:"https://chatgpt.com/plugins/test",claude:"https://claude.ai/plugins/test",npmAvailable:true}}/>);`;
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
  expect(reached.has("Copy starter prompt")).toBe(true);
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
    /backs up changed settings|Step 1 of 2/,
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
    for (const client of ["codex", "claude"])
      for (const scope of ["global", "project"]) {
        await page
          .getByRole("radio", {
            name: mode === "hosted" ? /In this browser/ : /On your Mac/,
          })
          .check();
        await page.getByLabel("Client", { exact: true }).selectOption(client);
        if (mode === "hosted") {
          await expect(
            page.getByRole("link", {
              name: `Install for ${client === "codex" ? "Codex" : "Claude Code"}`,
              exact: true,
            }),
          ).toBeVisible();
          if (
            (await page
              .locator(".setup-instructions details")
              .getAttribute("open")) === null
          ) {
            await page.getByText("Advanced setup", { exact: true }).click();
          }
        }
        const scopeLabel =
          mode === "hosted" ? "Manual installation scope" : "Install for";
        await page.getByLabel(scopeLabel, { exact: true }).focus();
        await page.getByLabel(scopeLabel, { exact: true }).selectOption(scope);
        await expect(
          page.getByLabel(scopeLabel, { exact: true }),
        ).toBeFocused();
        assert.equal(
          await page
            .getByLabel(
              mode === "hosted" ? "Connection settings" : "Setup command",
              { exact: true },
            )
            .inputValue(),
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
          await page.getByLabel(scopeLabel, { exact: true }).inputValue(),
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
    "PASS: all eight hosted/local configuration variants, selection focus, preserved choices, clipboard success/unavailable, starter prompt, Escape focus, reopen and responsive overflow",
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
    await expect(dialog.getByLabel("Client", { exact: true })).toBeVisible();
    await expect(dialog).not.toContainText(
      /local worker|@tfoundry\/local-worker|On your Mac/i,
    );
    await expect(dialog.getByRole("link", { name: /Install for/ })).toHaveCount(
      0,
    );
    await expect(
      dialog.getByLabel("Setup command", { exact: true }),
    ).toHaveCount(0);
    for (const client of ["codex", "claude"]) {
      await page.getByLabel("Client", { exact: true }).selectOption(client);
      for (const scope of ["global", "project"]) {
        await page
          .getByLabel("Manual installation scope", { exact: true })
          .selectOption(scope);
        expect(
          await page
            .getByLabel("Connection settings", { exact: true })
            .inputValue(),
        ).toContain("https://example.test/mcp");
        await expect(
          page.getByLabel("Starter prompt", { exact: true }),
        ).toHaveValue(/sample-project/);
      }
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

test("public listing links stay bound to their deployment and npm is optional", async ({
  page,
}) => {
  const result = await build({
    stdin: {
      contents: `import React from 'react';import {createRoot} from 'react-dom/client';import {ConnectToCodex} from './src/features/onboarding/browser/components/connectToCodex.component';const root=createRoot(document.getElementById('root'));window.renderOrigin=(origin)=>root.render(<ConnectToCodex origin={origin} installations={{origin:'https://3dai.theoryfoundry.com',codex:'https://chatgpt.com/plugins/test',claude:'https://claude.ai/plugins/test'}}/>);window.renderOrigin('https://3dai.theoryfoundry.com');`,
      resolveDir: root + "/apps/site",
      loader: "tsx",
    },
    bundle: true,
    write: false,
    jsx: "automatic",
  });
  await page.setContent('<div id="root"></div>');
  await page.addScriptTag({ content: result.outputFiles[0].text });
  await page
    .getByRole("button", { name: "Connect CAD tools", exact: true })
    .click();
  await expect(
    page.getByRole("link", { name: "Install for Codex", exact: true }),
  ).toHaveAttribute("href", "https://chatgpt.com/plugins/test");
  await expect(page.getByLabel("Setup command", { exact: true })).toHaveCount(
    0,
  );
  await page.getByLabel("Client", { exact: true }).selectOption("claude");
  await expect(
    page.getByRole("link", { name: "Install for Claude Code", exact: true }),
  ).toHaveAttribute("href", "https://claude.ai/plugins/test");
  await page.evaluate(() => window.renderOrigin("http://localhost:3000"));
  await expect(page.getByRole("link", { name: /Install for/ })).toHaveCount(0);
  await expect(
    page.getByLabel("Connection settings", { exact: true }),
  ).toHaveValue(/http:\/\/localhost:3000\/mcp/);
  await expect(page.getByLabel("Setup command", { exact: true })).toHaveCount(
    0,
  );
});
