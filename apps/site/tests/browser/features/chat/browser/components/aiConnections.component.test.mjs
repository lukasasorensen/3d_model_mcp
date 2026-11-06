import { test, expect } from "playwright/test";
import { build } from "esbuild";
import { root, applicationStyles } from "../../../../browser.fixture.mjs";

const id = "f29202c1-35d7-4d8a-9b51-504c964f3b91";
async function mount(page, picker = false) {
  const bundle = await build({
    stdin: {
      contents: picker
        ? `import React from 'react';import {createRoot} from 'react-dom/client';import {ChatModelPicker,useAiChatSelection} from './src/features/chat/browser/index';function Harness(){const ai=useAiChatSelection(true);const [active,setActive]=React.useState(false);return <><ChatModelPicker ai={ai} disabled={active}/><button onClick={()=>setActive(!active)}>Toggle active</button><span data-testid="available">{String(ai.available)}</span></>};createRoot(document.querySelector('main')).render(<Harness/>);`
        : `import React from 'react';import {createRoot} from 'react-dom/client';import {AiConnections} from './src/features/chat/browser/index';createRoot(document.querySelector('main')).render(<AiConnections origin="https://example.test" account="owner" workerVersion="0.2.0"/>);`,
      resolveDir: root + "/apps/site",
      loader: "tsx",
    },
    jsx: "automatic",
    bundle: true,
    write: false,
  });
  await page.route("https://example.test/settings/ai-connections", (route) =>
    route.fulfill({ contentType: "text/html", body: "<main></main>" }),
  );
  await page.goto("https://example.test/settings/ai-connections");
  await page.addStyleTag({ content: await applicationStyles() });
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
}
test("users save, edit, test, default and delete connections without reading saved tokens", async ({
  page,
}) => {
  let rows = [];
  const received = [];
  await page.route("**/v1/ai/connections**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (request.method() === "GET")
      return route.fulfill({ json: { connections: rows, companions: [] } });
    if (request.method() === "DELETE") {
      rows = [];
      return route.fulfill({ json: { ok: true } });
    }
    const body = request.postDataJSON();
    received.push(body);
    if (path.endsWith("/test")) return route.fulfill({ json: { ok: true } });
    const value = { ...body };
    delete value.token;
    rows = [{ ...value, id, hasCredential: true, status: "ready" }];
    return route.fulfill({ json: { id } });
  });
  await mount(page);
  await page.getByLabel("Connection name").fill("My provider");
  await page.getByLabel("Default model ID").fill("test-model");
  await page
    .getByLabel("API token", { exact: true })
    .fill("secret-fixture-token");
  await page.getByRole("button", { name: "Save connection" }).click();
  await expect(page.getByRole("status")).toHaveText("Connection saved.");
  await expect(
    page.getByText("API token saved", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("secret-fixture-token", { exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Make default" }).click();
  await expect(page.getByRole("status")).toHaveText(
    "Default connection updated.",
  );
  assertNoToken(received.at(-1));
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await expect(
    page.getByLabel("Replace API token (leave blank to keep)"),
  ).toHaveValue("");
  await page.getByLabel("Default model ID").fill("revised-model");
  await page.getByRole("button", { name: "Save connection" }).click();
  await expect(page.getByRole("status")).toHaveText("Connection saved.");
  assertNoToken(received.at(-1));
  await page.getByRole("button", { name: "Test connection" }).click();
  await expect(page.getByRole("status")).toHaveText(
    "Structured tool calling passed.",
  );
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("Connection deleted.");
});
function assertNoToken(value) {
  expect(value).not.toHaveProperty("token");
  expect(value).not.toHaveProperty("hasCredential");
}

test("missing real-AI configuration offers a settings path and prevents submission", async ({
  page,
}) => {
  await page.route("**/v1/features/sidebar-chat", (route) =>
    route.fulfill({
      json: { isSidebarChatEnabled: true, isRealAiEnabled: true },
    }),
  );
  await page.route("**/v1/ai/connections", (route) =>
    route.fulfill({ json: { connections: [], companions: [] } }),
  );
  await mount(page, true);
  await expect(page.getByRole("status")).toHaveText(
    "Choose a saved connection or add one in AI connection settings.",
  );
  await expect(
    page.getByRole("link", { name: "Manage AI connections" }),
  ).toHaveAttribute("href", "/settings/ai-connections");
  await expect(page.getByTestId("available")).toHaveText("false");
});
test("chat selection supports manual models, offline recovery and locks during a turn", async ({
  page,
}) => {
  await page.route("**/v1/features/sidebar-chat", (route) =>
    route.fulfill({
      json: { isSidebarChatEnabled: true, isRealAiEnabled: true },
    }),
  );
  await page.route("**/v1/ai/connections", (route) =>
    route.fulfill({
      json: {
        companions: [],
        connections: [
          {
            id,
            name: "Computer",
            provider: "ollama",
            location: "local",
            model: "local-model",
            isDefault: true,
            hasCredential: false,
            status: "offline",
          },
          {
            id: "1a45dcf4-f0da-4a47-b2bd-7a9c36f4e5a8",
            name: "Cloud",
            provider: "openai",
            location: "hosted",
            model: "cloud-model",
            isDefault: false,
            hasCredential: true,
            status: "ready",
          },
        ],
      },
    }),
  );
  await page.route("**/models", (route) =>
    route.fulfill({
      status: 503,
      json: { error: { message: "Discovery unavailable. Enter a model ID." } },
    }),
  );
  await mount(page, true);
  await expect(page.getByLabel("Model ID", { exact: true })).toHaveValue(
    "local-model",
  );
  await expect(page.getByRole("status")).toHaveText(
    "Start the AI companion on your computer, then retry.",
  );
  await expect(page.getByTestId("available")).toHaveText("false");
  await page
    .getByLabel("Connection", { exact: true })
    .selectOption("1a45dcf4-f0da-4a47-b2bd-7a9c36f4e5a8");
  await page.getByRole("button", { name: "Find models" }).click();
  await expect(page.getByRole("status")).toHaveText(
    "Discovery unavailable. Enter a model ID.",
  );
  await page
    .getByLabel("Model ID", { exact: true })
    .fill("manually-entered-model");
  await expect(page.getByTestId("available")).toHaveText("true");
  await page.getByRole("button", { name: "Toggle active" }).click();
  await expect(page.getByLabel("Model ID", { exact: true })).toBeDisabled();
  await expect(page.getByLabel("Connection", { exact: true })).toBeDisabled();
});
