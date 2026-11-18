/* global window, document */
import { expect } from "playwright/test";
import { test } from "../../../browser.fixture.mjs";
import { mountPanels } from "../fixtures/panels.fixture.mjs";

test("disclosures retain drafts, keep headers operable while busy, and reopen before error focus", async ({
  page,
}) => {
  await mountPanels(page);
  const layers = page.getByRole("region", { name: "Layers", exact: true });
  const toggle = page.getByRole("button", { name: "Layers", exact: true });
  const input = page.getByRole("textbox", {
    name: "Layers draft",
    exact: true,
  });
  await input.fill("Retain this draft");
  await toggle.focus();
  await page.keyboard.press("Space");
  await expect(toggle).toBeFocused();
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(input).toBeHidden();
  await expect(
    layers.getByText("Unsaved changes", { exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("button", { name: "Edit objects", exact: true }),
  ).toBeFocused();
  await toggle.focus();
  await page.keyboard.press("Enter");
  await expect(input).toHaveValue("Retain this draft");
  await page.evaluate(() => window.beginPanel());
  await toggle.click();
  await expect(layers.getByText("Working", { exact: true })).toBeVisible();
  await expect(toggle).toBeEnabled();
  await page.evaluate(() => window.failPanel());
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await expect(layers.getByRole("alert")).toBeFocused();
  await expect(input).toHaveValue("Retain this draft");
  await page.evaluate(() => window.clearPanel());
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await page.evaluate(() => window.failPanel());
  await expect(layers.getByRole("alert")).toBeFocused();
  await toggle.click();
  await page.evaluate(() => window.clearPanel());
  await page.evaluate(() => window.failPanel(true));
  await expect(layers.getByRole("alert")).toBeFocused();
  await toggle.click();
  await page.evaluate(() => window.clearPanel());
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await page.evaluate(() => window.failPanel(true));
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await expect(layers.getByRole("alert")).toBeFocused();
  await toggle.click();
  await page.evaluate(() => window.changeProject());
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await expect(input).toHaveValue("");
  expect(await page.locator("[aria-live]").count()).toBe(0);
});

test("any number of panels flow at the container breakpoint with unique accessible controls", async ({
  page,
}) => {
  await mountPanels(page);
  await page.setViewportSize({ width: 1600, height: 900 });
  for (const width of [959, 960, 961, 320]) {
    await page.locator("#root").evaluate((el, width) => {
      el.style.width = `${width}px`;
    }, width);
    await expect
      .poll(async () =>
        page.locator(".panel-layout-grid").evaluate((el, width) => {
          const main = el
            .querySelector(".panel-layout-main")
            .getBoundingClientRect();
          const stack = el
            .querySelector(".panel-stack")
            .getBoundingClientRect();
          return width >= 960
            ? stack.x >= main.right + 16 && stack.width <= 320
            : stack.y >= main.bottom;
        }, width),
      )
      .toBe(true);
    const boxes = await page.locator(".panel").evaluateAll((els) =>
      els.map((el) => {
        const r = el.getBoundingClientRect();
        return { y: r.y, bottom: r.bottom };
      }),
    );
    for (let i = 1; i < boxes.length; i++)
      expect(boxes[i].y).toBeGreaterThanOrEqual(boxes[i - 1].bottom);
    await expect(
      page.getByRole("button", {
        name: "Action for Future panel",
        exact: true,
      }),
    ).toBeVisible();
  }
  const ids = await page
    .locator("[id]")
    .evaluateAll((els) => els.map((el) => el.id));
  expect(new Set(ids).size).toBe(ids.length);
  for (const button of await page.locator(".panel-toggle").all()) {
    const body = await button.getAttribute("aria-controls");
    expect(
      await page.evaluate((id) => Boolean(document.getElementById(id)), body),
    ).toBe(true);
  }
});
