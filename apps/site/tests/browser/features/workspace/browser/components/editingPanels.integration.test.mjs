/* global document, window */
import { expect } from "playwright/test";
import { test } from "../../../../browser.fixture.mjs";
import { mountWorkspaceJourney } from "../fixtures/workspaceJourney.fixture.mjs";

async function assertPanelGeometry(page, expectedContainerWidth) {
  await expect(async () => {
    const geometry = await page
      .locator(".workspace-editor")
      .evaluate((editor) => {
        const box = (selector) => {
          const element = editor.querySelector(selector);
          if (!element || element.hidden) return null;
          const { x, y, width, right, bottom } =
            element.getBoundingClientRect();
          return {
            x,
            y,
            width,
            right,
            bottom,
            overflows: element.scrollWidth > element.clientWidth,
          };
        };
        return {
          container: editor.getBoundingClientRect().width,
          workspaceOverflows:
            document.documentElement.scrollWidth > window.innerWidth,
          toolbar: box(".editor-tool-panel"),
          preview: box(".editor-viewport"),
          content: box(".editor-content"),
          layers: box(".editor-layer-panel"),
          parameters: box(".editor-parameter-panel"),
        };
      });
    const { toolbar, preview, parameters } = geometry;
    if (expectedContainerWidth !== undefined)
      expect(geometry.container).toBe(expectedContainerWidth);
    expect(geometry.workspaceOverflows, JSON.stringify(geometry)).toBe(false);
    expect(preview.width).toBe(geometry.content.width);
    if (toolbar) {
      expect(toolbar.overflows, "Transform toolbar overflow").toBe(false);
      expect(preview.y).toBeGreaterThanOrEqual(toolbar.bottom);
    }
    expect(parameters).not.toBeNull();
    expect(parameters.overflows, "Parameters overflow").toBe(false);
    if (geometry.container >= (geometry.layers ? 1200 : 780)) {
      if (geometry.layers) {
        expect(geometry.layers.x).toBeGreaterThanOrEqual(preview.x);
        expect(geometry.layers.y).toBeLessThan(preview.bottom);
        expect(geometry.layers.right).toBeLessThan(parameters.x);
      }
      expect(parameters.y).toBeLessThan(preview.bottom);
      expect(parameters.right).toBeLessThanOrEqual(preview.right);
      if (toolbar) expect(parameters.y).toBeGreaterThanOrEqual(toolbar.bottom);
    } else {
      if (geometry.layers)
        expect(geometry.layers.y).toBeGreaterThanOrEqual(preview.bottom);
      expect(parameters.y).toBeGreaterThanOrEqual(
        geometry.layers?.bottom ?? preview.bottom,
      );
    }
  }).toPass({ timeout: 5000 });
}

const parameterToggle = (page) =>
  page.getByRole("button", { name: "Parameters", exact: true });
const parameterRegion = (page) =>
  page.getByRole("region", { name: "Parameters", exact: true });
const objectPosition = (page) =>
  page.getByRole("textbox", { name: "Position X · mm", exact: true });

async function selectMainObject(page) {
  await page
    .getByRole("combobox", { name: "Selected object" })
    .selectOption("main-object");
  await expect(objectPosition(page)).toBeVisible();
}

test("populated editing panels remain separate with chat, narrow containers, and enlarged text", async ({
  page,
}) => {
  const { errors } = await mountWorkspaceJourney(
    page,
    1600,
    false,
    false,
    false,
    true,
  );
  await parameterToggle(page).click();
  await selectMainObject(page);
  const parameters = parameterRegion(page);
  await expect(parameters.getByRole("textbox").first()).toHaveValue("2");
  await expect(
    page.getByRole("button", {
      name: "Select Main object with a deliberately long descriptive name (main-object)",
      exact: true,
    }),
  ).toBeVisible();
  const layersToggle = page.getByRole("button", {
    name: "Layers",
    exact: true,
  });
  await layersToggle.click();
  for (const width of [779, 780, 781]) {
    await page.locator(".workspace-editor").evaluate((el, width) => {
      el.style.maxWidth = `${width}px`;
    }, width);
    await assertPanelGeometry(page, width);
  }
  await layersToggle.click();
  for (const width of [1199, 1200, 1201]) {
    await page.locator(".workspace-editor").evaluate((el, width) => {
      el.style.maxWidth = `${width}px`;
    }, width);
    await assertPanelGeometry(page, width);
  }
  await page.locator(".workspace-editor").evaluate((el) => {
    el.style.maxWidth = "";
  });
  for (const width of [1600, 1440, 1007, 1008, 1009, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await assertPanelGeometry(page);
    const action = parameters.getByRole("button", {
      name: "Reset to defaults",
      exact: true,
    });
    await action.scrollIntoViewIfNeeded();
    await action.click({ trial: true });
    if ([1600, 390].includes(width))
      await page.screenshot({
        path: test.info().outputPath(`editing-panels-${width}.png`),
        fullPage: true,
      });
  }
  await page.addStyleTag({ content: ":root {font-size: 24px;}" });
  await assertPanelGeometry(page);
  await page.setViewportSize({ width: 1600, height: 900 });
  await assertPanelGeometry(page);
  expect(errors).toEqual([]);
});

test("chat width drives panel layout without changing panel order or drafts", async ({
  page,
}) => {
  const originalRoute = page.route.bind(page);
  page.route = async (pattern, handler) =>
    originalRoute(pattern, async (route) => {
      if (
        new URL(route.request().url()).pathname === "/v1/features/sidebar-chat"
      )
        return route.fulfill({ json: { isSidebarChatEnabled: true } });
      return handler(route);
    });
  const { errors } = await mountWorkspaceJourney(
    page,
    1600,
    false,
    false,
    false,
    true,
  );
  await parameterToggle(page).click();
  const field = parameterRegion(page).getByRole("textbox").first();
  await field.fill("3");
  await assertPanelGeometry(page);
  const chatToggle = page.locator(".chat-toggle");
  await chatToggle.click();
  await assertPanelGeometry(page);
  await expect(field).toHaveValue("3");
  await chatToggle.click();
  await assertPanelGeometry(page);
  await expect(field).toHaveValue("3");
  expect(errors).toEqual([]);
});

test("collapsing real edits preserves drafts and pending work, then validation errors reopen and focus", async ({
  page,
}) => {
  const { controls, errors } = await mountWorkspaceJourney(
    page,
    1600,
    false,
    false,
    false,
    true,
  );
  await selectMainObject(page);
  const position = objectPosition(page);
  const toggle = parameterToggle(page);
  await toggle.click();
  const parameters = parameterRegion(page);
  const field = parameters.getByRole("textbox").first();
  await field.fill("3");
  await toggle.click();
  await expect(field).toBeHidden();
  await toggle.click();
  await expect(field).toHaveValue("3");
  await parameters
    .getByRole("button", { name: "Apply changes", exact: true })
    .click();
  await expect.poll(() => Boolean(controls.releaseEdit)).toBe(true);
  await expect(position).toBeDisabled();
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  controls.releaseEdit();
  await expect(parameters.getByRole("alert")).toBeFocused();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await expect(field).toHaveValue("3");
  await expect(position).toBeEnabled();
  expect(errors).toEqual([]);
});

for (const mode of ["empty", "loading", "error"]) {
  test(`panel layout survives ${mode} data`, async ({ page }) => {
    const originalRoute = page.route.bind(page);
    let release;
    const gate = new Promise((resolve) => {
      release = resolve;
    });
    page.route = async (pattern, handler) =>
      originalRoute(pattern, async (route) => {
        const path = new URL(route.request().url()).pathname;
        if (
          ["/layers", "/objects", "/parameters"].some((suffix) =>
            path.endsWith(suffix),
          )
        ) {
          if (mode === "loading") await gate;
          if (mode === "error")
            return route.fulfill({
              status: 500,
              json: { error: "Fixture failure" },
            });
        }
        return handler(route);
      });
    const { errors } = await mountWorkspaceJourney(
      page,
      1440,
      false,
      false,
      false,
      mode !== "empty",
    );
    await expect(
      page.getByRole("region", { name: "Layers", exact: true }),
    ).toBeVisible();
    const toggle = parameterToggle(page);
    if (mode !== "error") await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    if (mode === "loading")
      await expect(
        page.getByText("Loading parameters…", { exact: true }),
      ).toBeVisible();
    if (mode === "error")
      await expect(parameterRegion(page).getByRole("alert")).toBeVisible();
    await assertPanelGeometry(page);
    release();
    expect(errors).toEqual([]);
  });
}
