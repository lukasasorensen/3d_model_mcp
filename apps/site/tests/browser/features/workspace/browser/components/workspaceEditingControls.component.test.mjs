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
  expect(right.x + right.width).toBeLessThanOrEqual(scene.x + scene.width);
  expect(right.y).toBeLessThan(scene.y + scene.height);
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

test("an unfinished inline rename survives a parameter save lock", async ({
  page,
}) => {
  const { controls } = await mountWorkspaceEditingControls(page);
  await page.getByRole("button", { name: "Actions for Lid (lid)" }).click();
  await page.getByRole("menuitem", { name: "Rename" }).click();
  const rename = page.getByRole("textbox", { name: "Rename Lid" });
  await rename.fill("Travel lid");
  await page.getByRole("textbox", { name: "Width · mm" }).fill("14");
  await page
    .getByRole("button", { name: "Apply changes", exact: true })
    .click();
  await expect(rename).toBeDisabled();
  await expect(rename).toHaveValue("Travel lid");
  await expect.poll(() => controls.requests.length).toBe(1);
  controls.release();
  await expect(rename).toBeEnabled();
  await rename.press("Enter");
  await expect(
    page.getByRole("button", { name: "Select Travel lid (lid)" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Apply layers", exact: true }),
  ).toBeEnabled();
});

test("reselecting the active layer preserves invalid transform input", async ({
  page,
}) => {
  await mountWorkspaceEditingControls(page);
  const apply = page.getByRole("button", { name: "Apply object changes" });
  const y = page.getByRole("textbox", { name: "Position Y · mm" });
  await page.getByRole("textbox", { name: "Position X · mm" }).fill("3");
  await y.fill("");
  await expect(apply).toBeDisabled();
  await page.getByRole("button", { name: "Select Body (body)" }).click();
  await expect(y).toHaveValue("");
  await expect(y).toHaveAttribute("aria-invalid", "true");
  await expect(apply).toBeDisabled();
  await y.fill("4");
  await expect(apply).toBeEnabled();
});

test("a retained layer draft cannot select an object removed in the current revision", async ({
  page,
}) => {
  const { modelFiles, showRevision } =
    await mountWorkspaceEditingControls(page);
  await page.getByRole("button", { name: "Show Lid (lid)" }).click();
  const next = structuredClone(modelFiles);
  next.objects = next.objects.filter((object) => object.id !== "lid");
  next.composition.objectIds = ["body"];
  next.presentation.objectOrder = ["body"];
  await showRevision("r2", next);
  const selector = page.getByRole("combobox", { name: "Selected object" });
  await expect(selector.getByRole("option", { name: "Lid · lid" })).toHaveCount(
    0,
  );
  await expect(selector).toBeEnabled();
  const body = page.getByRole("button", { name: "Select Body (body)" });
  await expect(body).toBeEnabled();
  await expect(
    page.getByRole("button", { name: "Select Lid (lid)" }),
  ).toBeDisabled();
  await expect(selector).toHaveValue("body");
  await expect(body).toHaveAttribute("aria-pressed", "true");
  await expect(
    page.getByRole("group", { name: "Transform Body" }),
  ).toBeVisible();
});

test("the tucked Layers card peeks on hover and focus and reopens the draft", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1360, height: 940 });
  await mountWorkspaceEditingControls(page);
  const layers = page.getByRole("region", { name: "Layers", exact: true });
  const viewport = page.locator(".editor-viewport");
  const size = await viewport.boundingBox();
  const close = layers.getByRole("button", { name: "Close layers" });
  await layers.getByRole("button", { name: "Show Lid (lid)" }).click();
  await close.click();
  const edge = page.getByRole("button", { name: "Open layers" });
  await expect(layers).toBeHidden();
  const exposedWidth = async () => {
    const card = await edge.boundingBox();
    return card.x + card.width - size.x;
  };
  await expect.poll(exposedWidth).toBeCloseTo(44, 0);
  await page.mouse.move(size.x + 12, (await edge.boundingBox()).y + 12);
  await expect.poll(exposedWidth).toBeGreaterThan(70);
  await expect(layers).toBeHidden();
  await edge.click();
  await expect(close).toBeFocused();
  await expect(
    layers.getByRole("button", { name: "Show Lid (lid)" }),
  ).toHaveAttribute("aria-pressed", "false");
  expect((await viewport.boundingBox()).width).toBe(size.width);

  await close.press("Escape");
  await page.mouse.move(0, 0);
  await edge.focus();
  await expect.poll(exposedWidth).toBeGreaterThan(70);
  await edge.press("Enter");
  await expect(close).toBeFocused();
  await close.click();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(edge).toBeHidden();
  await page.getByRole("button", { name: "Layers", exact: true }).click();
  await expect(
    layers.getByRole("button", { name: "Show Lid (lid)" }),
  ).toHaveAttribute("aria-pressed", "false");
});

test.describe("tablet Layers card", () => {
  test.use({ hasTouch: true, viewport: { width: 900, height: 800 } });

  test("tapping the exposed edge opens Layers without hover", async ({
    page,
  }) => {
    await mountWorkspaceEditingControls(page);
    await page.getByRole("button", { name: "Close parameters" }).tap();
    const close = page.getByRole("button", { name: "Close layers" });
    await close.tap();
    const edge = page.getByRole("button", { name: "Open layers" });
    const card = await edge.boundingBox();
    await page.touchscreen.tap(
      card.x + card.width - 16,
      card.y + card.height / 2,
    );
    await expect(close).toBeFocused();
    await expect(
      page.getByRole("button", { name: "Select Body (body)" }),
    ).toBeVisible();
  });
});
