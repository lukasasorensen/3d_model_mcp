/* global document, window */
import { expect } from "playwright/test";
import { test } from "../../../../browser.fixture.mjs";
import { mountWorkspaceJourney } from "../fixtures/workspaceJourney.fixture.mjs";

async function assertPanelGeometry(page, expectedContainerWidth) {
  await expect(async () => {
    // Read every box in the same layout pass after the container query settles.
    const { containerWidth, main, panels, pageOverflows } = await page
      .locator(".panel-layout")
      .evaluate((layout) => {
        const box = (element) => {
          const { x, y, width, right, bottom } =
            element.getBoundingClientRect();
          return { x, y, width, right, bottom };
        };
        return {
          containerWidth: layout.getBoundingClientRect().width,
          main: box(layout.querySelector(".panel-layout-main")),
          panels: [...layout.querySelectorAll(".panel-stack > .panel")].map(
            (panel) => ({
              ...box(panel),
              overflows: panel.scrollWidth > panel.clientWidth,
            }),
          ),
          pageOverflows:
            document.documentElement.scrollWidth > window.innerWidth,
        };
      });

    if (expectedContainerWidth !== undefined)
      expect(containerWidth).toBe(expectedContainerWidth);
    expect(panels).toHaveLength(3);
    for (const [index, panel] of panels.entries()) {
      expect(panel.width).toBeGreaterThanOrEqual(270);
      expect(panel.overflows).toBe(false);
      if (index)
        expect(panel.y).toBeGreaterThanOrEqual(panels[index - 1].bottom);
    }
    if (containerWidth >= 960)
      expect(panels[0].x).toBeGreaterThanOrEqual(main.right + 16);
    else expect(panels[0].y).toBeGreaterThanOrEqual(main.bottom);
    expect(pageOverflows).toBe(false);
  }).toPass({ timeout: 5000 });
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
  const parameters = page.getByRole("region", {
    name: "Parameters",
    exact: true,
  });
  await expect(parameters.getByRole("textbox").first()).toHaveValue("2");
  await expect(
    page.getByRole("textbox", { name: "Position X · mm", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: "Select Main object with a deliberately long descriptive name (main-object)",
      exact: true,
    }),
  ).toBeVisible();
  for (const width of [959, 960, 961]) {
    await page.locator(".model-primary").evaluate((el, width) => {
      el.style.maxWidth = `${width}px`;
    }, width);
    await assertPanelGeometry(page, width);
  }
  await page.locator(".model-primary").evaluate((el) => {
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
  const field = page
    .getByRole("region", { name: "Parameters", exact: true })
    .getByRole("textbox")
    .first();
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
  const objects = page.getByRole("region", {
    name: "Edit objects",
    exact: true,
  });
  const toggle = page.getByRole("button", {
    name: "Edit objects",
    exact: true,
  });
  const x = objects.getByRole("textbox", {
    name: "Position X · mm",
    exact: true,
  });
  await x.fill("12");
  await toggle.click();
  await expect(x).toBeHidden();
  await expect(
    objects.getByText("Unsaved changes", { exact: true }),
  ).toBeVisible();
  await toggle.click();
  await expect(x).toHaveValue("12");
  await objects
    .getByRole("button", { name: "Apply object changes", exact: true })
    .click();
  await expect.poll(() => Boolean(controls.releaseEdit)).toBe(true);
  await toggle.click();
  await expect(objects.getByText("Working", { exact: true })).toBeVisible();
  await expect(
    page
      .getByRole("region", { name: "Parameters", exact: true })
      .getByRole("textbox")
      .first(),
  ).toBeDisabled();
  controls.releaseEdit();
  await expect(objects.getByRole("alert")).toBeFocused();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await expect(x).toHaveValue("12");
  await expect(
    page
      .getByRole("region", { name: "Parameters", exact: true })
      .getByRole("textbox")
      .first(),
  ).toBeEnabled();
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
    await expect(page.locator(".panel")).toHaveCount(3);
    if (mode === "loading")
      await expect(
        page.getByText("Loading parameters…", { exact: true }),
      ).toBeVisible();
    if (mode === "error")
      await expect(
        page.locator(".panel-indicators").getByText("Error", { exact: true }),
      ).toHaveCount(3);
    await assertPanelGeometry(page);
    release();
    expect(errors).toEqual([]);
  });
}
