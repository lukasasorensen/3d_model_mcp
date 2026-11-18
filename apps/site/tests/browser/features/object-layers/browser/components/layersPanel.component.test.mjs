/* global window, document */
import assert from "node:assert/strict";
import { expect } from "playwright/test";
import { test } from "../../../../browser.fixture.mjs";
import { mountLayersPanel } from "../fixtures/layersPanel.fixture.mjs";
const show = (page, id) =>
  page.getByRole("button", { name: `Show ${id}`, exact: true });
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
  await expect(show(page, "Lid (lid)")).toHaveAttribute(
    "aria-pressed",
    "false",
  );
  await expect(show(page, "Lid (lid)")).toHaveText("");
  await expect(show(page, "Lid (lid)").locator("svg")).toHaveAttribute(
    "aria-hidden",
    "true",
  );
  const actions = page.getByRole("button", {
    name: "Actions for Lid (lid)",
    exact: true,
  });
  await actions.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("menuitem", { name: "Rename" })).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(actions).toBeFocused();
  assert.deepEqual(
    await page
      .locator(".layers-list > li")
      .evaluateAll((nodes) => nodes.map((n) => n.dataset.objectId)),
    ["lid", "body", "spare"],
  );
  await actions.click();
  await expect(page.getByRole("menuitem", { name: "Move up" })).toBeDisabled();
  await page.getByRole("menuitem", { name: "Rename" }).click();
  const name = page.getByRole("textbox", { name: "Rename Lid" });
  await expect(name).toHaveValue("Lid");
  await name.fill("  ");
  await name.press("Enter");
  await expect(name).toHaveAttribute("aria-invalid", "true");
  await name.fill("  Top lid  ");
  await name.press("Enter");

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
  await expect(show(page, "Top lid (lid)")).toHaveAttribute(
    "aria-pressed",
    "false",
  );
  assert.deepEqual(
    await page
      .locator(".layers-list > li")
      .evaluateAll((nodes) => nodes.map((n) => n.dataset.objectId)),
    ["lid", "body", "spare"],
  );
  await expect(
    page.getByRole("button", { name: "Select Top lid (lid)", exact: true }),
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
  await show(page, "Lid (lid)").click();
  controls.mode = "reject";
  await page.getByRole("button", { name: "Apply layers", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("cannot be validated");
  await expect(show(page, "Lid (lid)")).toHaveAttribute(
    "aria-pressed",
    "false",
  );
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
  await show(page, "Lid (lid)").click();
  await show(page, "Spare lid (spare)").click();
  await show(page, "Body (body)").click();
  await expect(page.getByRole("alert")).toContainText(
    "Keep at least one object visible",
  );
  await expect(
    page.getByRole("button", { name: "Apply layers", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Discard layer changes" }).click();
  await expect(show(page, "Body (body)")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await show(page, "Lid (lid)").click();
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
  await expect(
    page.getByText("Its source file is hidden.", { exact: false }),
  ).toHaveCount(2);
  for (const name of ["Lid (lid)", "Spare lid (spare)"]) {
    await expect(show(page, name)).toBeDisabled();
    await expect(show(page, name)).toHaveAttribute("aria-pressed", "false");
  }
  await page
    .getByRole("button", { name: "Select Lid (lid)", exact: true })
    .click();
  await expect(page.locator('li[data-object-id="lid"]')).toHaveAttribute(
    "data-visible",
    "false",
  );
  await expect(page.locator('li[data-object-id="lid"]')).toHaveAttribute(
    "data-selected",
    "true",
  );
  await page.evaluate(() => window.chooseRevision("r1"));
  await expect(
    page.getByText("Historical layers are read-only.", { exact: false }),
  ).toBeVisible();
  await expect(show(page, "Lid (lid)")).toHaveAttribute("aria-pressed", "true");
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
  await expect(show(page, "Lid (lid)")).toHaveAttribute(
    "aria-pressed",
    "false",
  );
  await expect(show(page, "Lid (lid)")).toBeDisabled();
  await page
    .getByRole("button", {
      name: "Show source file lid.scad for Lid (lid)",
      exact: true,
    })
    .click();
  await expect(show(page, "Lid (lid)")).toHaveAttribute("aria-pressed", "true");
  await expect(show(page, "Lid (lid)")).toBeEnabled();
  await expect(show(page, "Spare lid (spare)")).toHaveAttribute(
    "aria-pressed",
    "false",
  );
  await page.getByRole("button", { name: "Apply layers", exact: true }).click();
  await expect(page.getByText("Layers saved.", { exact: true })).toBeVisible();
  assert.deepEqual(controls.requests[0].operations, [
    { op: "set_file_visibility", id: "lid-file", visible: true },
  ]);
  await page.evaluate(() => window.remount());
  await expect(show(page, "Lid (lid)")).toHaveAttribute("aria-pressed", "true");
  await expect(show(page, "Spare lid (spare)")).toHaveAttribute(
    "aria-pressed",
    "false",
  );
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
      const blocked = new Promise((resolve) => {
        releaseRefresh = resolve;
      });
      const stall = async (route) => {
        enteredRefresh();
        await blocked;
        await route
          .fulfill({ json: controls.snapshots[controls.current] })
          .catch(() => undefined);
      };
      await page.route("**/fixture/current", stall);
      await show(page, "Lid (lid)").click();
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
      await expect(show(page, "Lid (lid)")).toHaveAttribute(
        "aria-pressed",
        "false",
      );
      await expect(
        page.getByText("Preview: r1", { exact: true }),
      ).toBeVisible();
      const refreshButton = page.getByRole("button", {
        name: "Refresh saved layers",
      });
      await refreshButton.click();
      await expect(refreshButton).toBeDisabled();
      await expect(page.getByRole("alert")).toContainText("could not be");
      await page.clock.fastForward(15_001);
      await expect(refreshButton).toBeEnabled();
      await expect(page.getByRole("alert")).toContainText(
        "could not be refreshed within 15 seconds",
      );
      await expect(show(page, "Lid (lid)")).toHaveAttribute(
        "aria-pressed",
        "false",
      );
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

for (const device of ["mouse", "touch"]) {
  test(`${device} grip previews moves, cancels without changing order and commits on drop`, async ({
    page,
    context,
  }) => {
    const { controls } = await mountLayersPanel(page);
    const order = () =>
      page
        .locator(".layers-list li")
        .evaluateAll((rows) => rows.map((row) => row.dataset.objectId));
    const grip = page.getByRole("button", {
      name: "Drag Body (body) to reorder",
    });
    const start = await grip.boundingBox();
    const last = await page
      .getByRole("button", { name: "Select Spare lid (spare)", exact: true })
      .boundingBox();
    const x = start.x + start.width / 2;
    const y = start.y + start.height / 2;
    const endY = last.y + last.height - 2;
    const cdp = await context.newCDPSession(page);
    async function drag() {
      if (device === "touch") {
        await cdp.send("Input.dispatchTouchEvent", {
          type: "touchStart",
          touchPoints: [{ x, y }],
        });
        await cdp.send("Input.dispatchTouchEvent", {
          type: "touchMove",
          touchPoints: [{ x, y: endY }],
        });
      } else {
        await page.mouse.move(x, y);
        await page.mouse.down();
        await page.mouse.move(x, endY, { steps: 4 });
      }
      await expect(page.locator(".layers-list")).toHaveAttribute(
        "data-drop-end",
        "true",
      );
      expect(await order()).toEqual(["body", "lid", "spare"]);
    }
    await drag();
    if (device === "touch")
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchCancel",
        touchPoints: [],
      });
    else {
      await page.keyboard.press("Escape");
      await page.mouse.up();
    }
    await expect(page.locator(".layers-list")).toHaveAttribute(
      "data-drop-end",
      "false",
    );
    await expect(
      page.getByRole("button", { name: "Apply layers", exact: true }),
    ).toBeDisabled();
    await drag();
    if (device === "touch")
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchEnd",
        touchPoints: [],
      });
    else await page.mouse.up();
    await expect.poll(order).toEqual(["lid", "spare", "body"]);
    await expect(
      page
        .getByRole("status")
        .filter({ hasText: "Moved Body to position 3 of 3." }),
    ).toBeVisible();
    expect(await page.locator(".layer-select[aria-pressed=true]").count()).toBe(
      0,
    );
    expect(controls.requests).toHaveLength(0);
    await cdp.detach();
  });
}

test("edge menu remains reachable with enlarged text and Escape cancels renaming", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 320 });
  await mountLayersPanel(page);
  await page.addStyleTag({ content: ":root{font-size:24px}" });
  const trigger = page.getByRole("button", {
    name: "Actions for Spare lid (spare)",
    exact: true,
  });
  await trigger.click();
  const menu = page.getByRole("menu");
  const rect = await menu.boundingBox();
  expect(rect.x).toBeGreaterThanOrEqual(0);
  expect(rect.y).toBeGreaterThanOrEqual(0);
  expect(rect.x + rect.width).toBeLessThanOrEqual(320);
  expect(rect.y + rect.height).toBeLessThanOrEqual(320);
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
  await trigger.click();
  await page.getByRole("menuitem", { name: "Rename" }).click();
  const input = page.getByRole("textbox", { name: "Rename Spare lid" });
  await input.fill("Temporary name");
  await input.press("Escape");
  await expect(trigger).toBeFocused();
  await trigger.click();
  await page.mouse.click(1, 1);
  await expect(menu).toBeHidden();
  await expect(
    page.getByRole("button", { name: "Apply layers", exact: true }),
  ).toBeDisabled();
});

test("holding a grip at the list edge scrolls to a new drop position", async ({
  page,
}) => {
  const { controls, snapshot } = await mountLayersPanel(page);
  const next = structuredClone(controls.snapshots.r1.state);
  const objects = Array.from({ length: 30 }, (_, index) => ({
    id: `item-${index}`,
    name: `Item ${index}`,
    fileId: "lid-file",
  }));
  next.objects.push(...objects);
  next.composition.objectIds.push(...objects.map((o) => o.id));
  next.presentation.objectOrder.push(...objects.map((o) => o.id));
  controls.snapshots.r2 = snapshot("r2", next);
  controls.current = "r2";
  await page.evaluate(() => window.refresh());
  const list = page.getByRole("list", { name: "Objects in layer order" });
  await expect(list.getByRole("listitem")).toHaveCount(33);
  const bounds = await list.boundingBox();
  const grip = await page
    .getByRole("button", { name: "Drag Body (body) to reorder" })
    .boundingBox();
  await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
  await page.mouse.down();
  await page.mouse.move(grip.x + grip.width / 2, bounds.y + bounds.height - 4);
  await expect
    .poll(() => list.evaluate((el) => el.scrollTop))
    .toBeGreaterThan(bounds.height);
  await page.mouse.up();
  expect(
    await list
      .locator("li")
      .evaluateAll((rows) =>
        rows.findIndex((row) => row.dataset.objectId === "body"),
      ),
  ).toBeGreaterThan(5);
  await expect(
    page.getByRole("button", { name: "Apply layers", exact: true }),
  ).toBeEnabled();
  expect(controls.requests).toHaveLength(0);
});
