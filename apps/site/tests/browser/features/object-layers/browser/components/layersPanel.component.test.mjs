/* global window, document */
import assert from "node:assert/strict";
import { expect } from "playwright/test";
import { test } from "../../../../browser.fixture.mjs";
import { mountLayersPanel } from "../fixtures/layersPanel.fixture.mjs";
const show = (page, id) =>
  page.getByRole("checkbox", { name: `Show ${id}`, exact: true });
test("keyboard selection, visibility and layer order stay distinct, persist on remount and preserve composition", async ({
  page,
}) => {
  const { controls, errors } = await mountLayersPanel(page);
  const select = page.getByRole("button", {
    name: "Select Lid (lid)",
    exact: true,
  });
  await select.focus();
  await page.keyboard.press("Enter");
  await expect(select).toHaveAttribute("aria-pressed", "true");
  await show(page, "Lid (lid)").focus();
  await page.keyboard.press("Space");
  await expect(select).toHaveAttribute("aria-pressed", "true");
  await expect(
    page.getByText("Hidden · Selected", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("File: lid.scad (lid-file)", { exact: true }),
  ).toHaveCount(2);
  await page.getByRole("button", { name: "Move Lid (lid) up" }).focus();
  await page.keyboard.press("Enter");
  assert.deepEqual(
    await page
      .locator(".layers-list > li")
      .evaluateAll((nodes) => nodes.map((n) => n.dataset.objectId)),
    ["lid", "body", "spare"],
  );
  assert.equal(controls.requests.length, 0);
  await expect(page.getByText("Preview: r1", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Apply layers", exact: true }).click();
  await expect(page.getByText("Layers saved.", { exact: true })).toBeVisible();
  await expect(page.getByText("Preview: r2", { exact: true })).toBeVisible();
  assert.deepEqual(
    controls.snapshots.r2.state.composition,
    controls.snapshots.r1.state.composition,
  );
  await page.evaluate(() => window.remount());
  await expect(show(page, "Lid (lid)")).not.toBeChecked();
  assert.deepEqual(
    await page
      .locator(".layers-list > li")
      .evaluateAll((nodes) => nodes.map((n) => n.dataset.objectId)),
    ["lid", "body", "spare"],
  );
  await expect(
    page.getByRole("button", { name: "Select Lid (lid)", exact: true }),
  ).toHaveAttribute("aria-pressed", "false");
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
    true,
  );
  assert.deepEqual(errors, []);
});
test("rejection, cancellation and interrupted retry preserve accepted preview and draft", async ({
  page,
}) => {
  const { controls, errors } = await mountLayersPanel(page);
  await show(page, "Lid (lid)").uncheck();
  controls.mode = "reject";
  await page.getByRole("button", { name: "Apply layers", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("cannot be validated");
  await expect(show(page, "Lid (lid)")).not.toBeChecked();
  await expect(page.getByText("Preview: r1", { exact: true })).toBeVisible();
  controls.mode = "hold";
  await page.getByRole("button", { name: "Apply layers", exact: true }).click();
  await expect.poll(() => controls.requests.length).toBe(2);
  await page.getByRole("button", { name: "Cancel layer update" }).click();
  await expect(page.getByRole("alert")).toContainText("cancelled");
  controls.release?.();
  controls.mode = "lost";
  await page
    .getByRole("button", { name: "Retry interrupted layer update" })
    .click();
  await expect(page.getByRole("alert")).toContainText("could not be confirmed");
  const id = controls.requests.at(-1).requestId;
  controls.mode = "success";
  await page
    .getByRole("button", { name: "Retry interrupted layer update" })
    .click();
  await expect(page.getByText("Layers saved.", { exact: true })).toBeVisible();
  assert.equal(controls.requests.at(-1).requestId, id);
  assert.deepEqual(errors, []);
});
test("empty drafts, hidden files, stale drafts and historical selection remain understandable", async ({
  page,
}) => {
  const { controls, snapshot } = await mountLayersPanel(page);
  await show(page, "Lid (lid)").uncheck();
  await show(page, "Spare lid (spare)").uncheck();
  await show(page, "Body (body)").uncheck();
  await expect(page.getByRole("alert")).toContainText(
    "Keep at least one object visible",
  );
  await expect(
    page.getByRole("button", { name: "Apply layers", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Discard layer changes" }).click();
  await expect(show(page, "Body (body)")).toBeChecked();
  await show(page, "Lid (lid)").uncheck();
  const next = structuredClone(controls.snapshots.r1.state);
  next.presentation.hiddenFileIds = ["lid-file"];
  controls.snapshots.r2 = snapshot("r2", next);
  controls.current = "r2";
  await page.evaluate(() => window.refresh());
  await expect(show(page, "Body (body)")).toBeDisabled();
  await expect(
    page.getByText("The current revision changed.", { exact: false }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Discard layer changes" }).click();
  await expect(page.getByText("Hidden by file", { exact: true })).toHaveCount(
    2,
  );
  await expect(show(page, "Lid (lid)")).toBeDisabled();
  await page
    .getByRole("button", { name: "Select Lid (lid)", exact: true })
    .click();
  await expect(page.getByText("Selected: Lid", { exact: false })).toContainText(
    "Hidden",
  );
  await page.evaluate(() => window.chooseRevision("r1"));
  await expect(
    page.getByText("Historical layers are read-only.", { exact: false }),
  ).toBeVisible();
  await expect(show(page, "Lid (lid)")).toBeChecked();
  await expect(show(page, "Lid (lid)")).toBeDisabled();
});

test("showing a hidden source file restores effective visibility and persists without showing individually hidden objects", async ({
  page,
}) => {
  const { controls, snapshot } = await mountLayersPanel(page);
  const next = structuredClone(controls.snapshots.r1.state);
  next.presentation.hiddenFileIds = ["lid-file"];
  next.presentation.hiddenObjectIds = ["spare"];
  controls.snapshots.r2 = snapshot("r2", next);
  controls.current = "r2";
  await page.evaluate(() => window.refresh());
  await expect(show(page, "Lid (lid)")).not.toBeChecked();
  await expect(show(page, "Lid (lid)")).toBeDisabled();
  await page
    .getByRole("button", {
      name: "Show source file lid.scad for Lid (lid)",
      exact: true,
    })
    .click();
  await expect(show(page, "Lid (lid)")).toBeChecked();
  await expect(show(page, "Lid (lid)")).toBeEnabled();
  await expect(show(page, "Spare lid (spare)")).not.toBeChecked();
  await page.getByRole("button", { name: "Apply layers", exact: true }).click();
  await expect(page.getByText("Layers saved.", { exact: true })).toBeVisible();
  assert.deepEqual(controls.requests[0].operations, [
    { op: "set_file_visibility", id: "lid-file", visible: true },
  ]);
  await page.evaluate(() => window.remount());
  await expect(show(page, "Lid (lid)")).toBeChecked();
  await expect(show(page, "Spare lid (spare)")).not.toBeChecked();
});

for (const mode of ["lost", "success"])
  for (const recovery of ["timeout", "cancel"])
    test(`${mode} layers refresh releases pending state after ${recovery}`, async ({
      page,
    }) => {
      await page.clock.install();
      const { controls, errors } = await mountLayersPanel(page);
      let releaseRefresh;
      let enteredRefresh;
      const entered = new Promise((resolve) => {
        enteredRefresh = resolve;
      });
      const stall = async (route) => {
        enteredRefresh();
        await new Promise((resolve) => {
          releaseRefresh = resolve;
        });
        await route
          .fulfill({ json: controls.snapshots[controls.current] })
          .catch(() => undefined);
      };
      await page.route("**/fixture/current", stall);
      await show(page, "Lid (lid)").uncheck();
      controls.mode = mode;
      await page
        .getByRole("button", { name: "Apply layers", exact: true })
        .click();
      await entered;
      await expect(
        page.getByText("Operation: pending", { exact: true }),
      ).toBeVisible();
      if (recovery === "cancel")
        await page.getByRole("button", { name: "Cancel layer update" }).click();
      else await page.clock.fastForward(15_001);
      await expect(
        page.getByText("Operation: idle", { exact: true }),
      ).toBeVisible();
      await expect(page.getByRole("alert")).toContainText("could not be");
      await expect(show(page, "Lid (lid)")).not.toBeChecked();
      await expect(
        page.getByText("Preview: r1", { exact: true }),
      ).toBeVisible();
      await page.unroute("**/fixture/current", stall);
      releaseRefresh();
      await page.getByRole("button", { name: "Refresh saved layers" }).click();
      await expect(
        page.getByText(`Preview: ${controls.current}`, { exact: true }),
      ).toBeVisible();
      assert.deepEqual(errors, []);
    });
