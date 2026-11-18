import assert from "node:assert/strict";
import { expect } from "playwright/test";
import { test } from "../../../../browser.fixture.mjs";
import { mountWorkspaceEditingControls } from "../fixtures/workspaceEditingControls.fixture.mjs";

test("object and layer saves mutually lock all editing panels and report workspace pending until failure reconciles", async ({
  page,
}) => {
  const { controls, errors } = await mountWorkspaceEditingControls(page);
  const position = page.getByRole("textbox", {
    name: "Position X · mm",
    exact: true,
  });
  const width = page.getByRole("textbox", { name: "Width · mm", exact: true });
  const showLid = page.getByRole("button", {
    name: "Show Lid (lid)",
    exact: true,
  });
  const applyObject = page.getByRole("button", {
    name: "Apply object changes",
    exact: true,
  });
  const applyLayers = page.getByRole("button", {
    name: "Apply layers",
    exact: true,
  });
  const applyParameters = page.getByRole("button", {
    name: "Apply changes",
    exact: true,
  });
  await position.fill("3");
  await width.fill("11");
  await showLid.click();
  await expect(applyObject).toBeEnabled();
  await expect(applyLayers).toBeEnabled();
  await expect(applyParameters).toBeEnabled();

  await applyObject.click();
  await expect(
    page.getByText("Workspace operation: pending", { exact: true }),
  ).toBeVisible();
  await expect(showLid).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Select Lid (lid)" }),
  ).toBeDisabled();
  await expect(width).toBeDisabled();
  await expect(applyLayers).toBeDisabled();
  await expect(applyParameters).toBeDisabled();
  await expect.poll(() => controls.requests.length).toBe(1);
  assert.equal(controls.requests[0].endpoint, "objects");
  controls.release();
  await expect(
    page.getByText("Workspace operation: idle", { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("alert")).toContainText(
    "objects fixture validation failed",
  );
  await expect(showLid).toBeEnabled();
  await expect(width).toBeEnabled();
  await expect(applyLayers).toBeEnabled();
  await expect(applyParameters).toBeEnabled();

  await applyLayers.click();
  await expect(
    page.getByText("Workspace operation: pending", { exact: true }),
  ).toBeVisible();
  await expect(position).toBeDisabled();
  await expect(width).toBeDisabled();
  await expect(applyObject).toBeDisabled();
  await expect(applyParameters).toBeDisabled();
  await expect.poll(() => controls.requests.length).toBe(2);
  assert.equal(controls.requests[1].endpoint, "layers");
  await page.getByRole("button", { name: "Close layers" }).click();
  const layersToggle = page.getByRole("button", {
    name: "Layers",
    exact: true,
  });
  await expect(layersToggle).toBeFocused();
  await expect(layersToggle).toHaveAttribute("aria-expanded", "false");
  controls.release();
  await expect(
    page.getByText("Workspace operation: idle", { exact: true }),
  ).toBeVisible();
  await expect(
    page
      .getByRole("region", { name: "Layers", exact: true })
      .getByRole("alert"),
  ).toContainText("layers fixture validation failed");
  await expect(layersToggle).toHaveAttribute("aria-expanded", "true");
  await expect(
    page
      .getByRole("region", { name: "Layers", exact: true })
      .getByRole("alert"),
  ).toBeFocused();
  await expect(position).toBeEnabled();
  await expect(width).toBeEnabled();
  await expect(applyObject).toBeEnabled();
  await expect(applyParameters).toBeEnabled();
  await expect(position).toHaveValue("3");
  await expect(width).toHaveValue("11");
  await expect(showLid).toHaveAttribute("aria-pressed", "false");
  assert.deepEqual(errors, []);
});

test("the floating panels share one viewport and parameter drafts survive closing and resizing", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1360, height: 940 });
  const { errors } = await mountWorkspaceEditingControls(page);
  const toolbar = page.getByRole("group", { name: "Object editing tools" });
  const viewport = page.getByTestId("model-viewer");
  const panel = page.getByRole("region", { name: "Parameters", exact: true });
  const toggle = page.getByRole("button", { name: /^Parameters/ });
  const input = panel.getByRole("textbox", { name: "Width · mm" });
  const geometry = async () =>
    Promise.all([
      toolbar.boundingBox(),
      viewport.boundingBox(),
      panel.boundingBox(),
    ]);
  await expect(page.locator("canvas")).toHaveCount(1);
  const [bar, scene, right] = await geometry();
  expect(right.x).toBeGreaterThanOrEqual(scene.x + scene.width);
  expect(right.y).toBeGreaterThanOrEqual(bar.y + bar.height);
  await input.fill("17");
  await input.press("Escape");
  await expect(toggle).toBeFocused();
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(input).toBeHidden();
  await toggle.click();
  await expect(input).toHaveValue("17");
  await page.setViewportSize({ width: 390, height: 844 });
  const [mobileBar, mobileScene, mobilePanel] = await geometry();
  expect(mobileScene.y).toBeGreaterThanOrEqual(mobileBar.y + mobileBar.height);
  expect(mobilePanel.y).toBeGreaterThanOrEqual(
    mobileScene.y + mobileScene.height,
  );
  expect(mobilePanel.x + mobilePanel.width).toBeLessThanOrEqual(390);
  await expect(page.locator("canvas")).toHaveCount(1);
  await expect(input).toHaveValue("17");
  assert.deepEqual(errors, []);
});

test("layer names, the selector and canvas share selection while row actions preserve it", async ({
  page,
}) => {
  const { controls } = await mountWorkspaceEditingControls(page);
  const lid = page.getByRole("button", { name: "Select Lid (lid)" });
  const selector = page.getByRole("combobox", { name: "Selected object" });
  await lid.click();
  await expect(selector).toHaveValue("lid");
  await expect(
    page.getByRole("group", { name: "Transform Lid" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Show Body (body)" }).click();
  await page.getByRole("button", { name: "Actions for Body (body)" }).click();
  await page.getByRole("menuitem", { name: "Move down" }).click();
  await expect(selector).toHaveValue("lid");
  await expect(lid).toHaveAttribute("aria-pressed", "true");
  await selector.selectOption("");
  const canvas = page.getByTestId("model-viewer").locator("canvas");
  await expect(async () => {
    await canvas.click();
    await expect(page.locator(".layer-select[aria-pressed=true]")).toHaveCount(
      1,
      { timeout: 500 },
    );
  }).toPass({ timeout: 8000 });
  const picked = await selector.inputValue();
  expect(picked).toBeTruthy();
  await expect(
    page.locator(`li[data-object-id="${picked}"] .layer-select`),
  ).toHaveAttribute("aria-pressed", "true");
  expect(controls.requests).toHaveLength(0);
});
