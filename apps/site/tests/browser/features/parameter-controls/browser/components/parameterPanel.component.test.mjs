/* global window, document */
import assert from "node:assert/strict";
import { expect } from "playwright/test";
import { test } from "../../../../browser.fixture.mjs";
import { mountParameterPanel } from "../fixtures/parameterPanel.fixture.mjs";

for (const mode of ["lost", "success"])
  for (const recovery of ["timeout", "cancel"])
    test(`${mode} update releases pending state when reconciliation ends by ${recovery}`, async ({
      page,
    }) => {
      await page.clock.install();
      const { controls, errors } = await mountParameterPanel(page);
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
      const width = page.getByRole("textbox", {
        name: "Width · mm",
        exact: true,
      });
      await width.fill("35");
      controls.mode = mode;
      await page
        .getByRole("button", { name: "Apply parameter changes" })
        .click();
      await entered;
      const requestId = controls.requests.at(-1).requestId;
      await expect(
        page.getByText("Operation: pending", { exact: true }),
      ).toBeVisible();
      if (recovery === "cancel")
        await page.getByRole("button", { name: "Cancel update" }).click();
      else await page.clock.fastForward(15_001);
      await expect(
        page.getByText("Operation: idle", { exact: true }),
      ).toBeVisible();
      await expect(page.getByRole("alert")).toContainText("could not be");
      await expect(
        page.getByRole("button", { name: "Refresh saved values" }),
      ).toBeEnabled();
      await expect(width).toBeEnabled();
      await expect(width).toHaveValue("35");
      await expect(
        page.getByText("Preview: r1", { exact: true }),
      ).toBeVisible();
      await page.unroute("**/fixture/current", stall);
      if (mode === "lost") {
        releaseRefresh();
        controls.mode = "success";
        await page
          .getByRole("button", { name: "Retry interrupted update" })
          .click();
        await expect(
          page.getByText("Changes saved.", { exact: true }),
        ).toBeVisible();
        assert.equal(controls.requests.at(-1).requestId, requestId);
      } else {
        // A late authoritative refresh may advance the preview, but cannot erase a draft.
        await width.fill("36");
        releaseRefresh();
        await expect(
          page.getByText("Preview: r2", { exact: true }),
        ).toBeVisible();
        await expect(width).toHaveValue("36");
        await expect(width).toBeDisabled();
      }
      assert.deepEqual(errors, []);
    });

test("touch users can adjust a slider or exact input without saving until Apply", async ({
  browser,
}) => {
  const context = await browser.newContext({
    hasTouch: true,
    isMobile: true,
    viewport: { width: 390, height: 844 },
  });
  const page = await context.newPage();
  try {
    const { controls, errors } = await mountParameterPanel(page);
    const slider = page.getByRole("slider", { name: "Width slider" });
    const bounds = await slider.boundingBox();
    assert.ok(bounds);
    await page.touchscreen.tap(
      bounds.x + bounds.width * 0.7,
      bounds.y + bounds.height / 2,
    );
    assert.equal(controls.requests.length, 0);
    const width = page.getByRole("textbox", {
      name: "Width · mm",
      exact: true,
    });
    await width.tap();
    await width.fill("35");
    await page.getByRole("button", { name: "Apply parameter changes" }).tap();
    await expect(
      page.getByText("Changes saved.", { exact: true }),
    ).toBeVisible();
    assert.equal(controls.requests[0].operations[0].value, 35);
    assert.deepEqual(errors, []);
  } finally {
    await context.close();
  }
});

test("native controls stage values, support keyboard and mobile reflow, then Apply, Reset and history", async ({
  page,
}) => {
  const { controls, errors } = await mountParameterPanel(page);
  const width = page.getByRole("textbox", { name: "Width · mm", exact: true });
  const slider = page.getByRole("slider", { name: "Width slider" });
  await expect(width).toHaveValue("20");
  await slider.focus();
  await page.keyboard.press("ArrowRight");
  await expect(width).toHaveValue("21");
  await page.keyboard.press("Home");
  await expect(width).toHaveValue("1");
  await page.keyboard.press("End");
  await expect(width).toHaveValue("100");
  assert.equal(controls.requests.length, 0);
  await width.fill("-");
  await expect(
    page.getByRole("button", { name: "Apply parameter changes" }),
  ).toBeDisabled();
  await expect(width).toHaveAttribute("aria-invalid", "true");
  await width.fill("30");
  await page.getByRole("checkbox", { name: "Enabled", exact: true }).focus();
  await page.keyboard.press("Space");
  await page
    .getByRole("combobox", { name: "Style", exact: true })
    .selectOption("2");
  await page
    .getByRole("textbox", { name: "Caption", exact: true })
    .fill("雪\nsecond line");
  assert.equal(controls.requests.length, 0);
  await page.getByRole("button", { name: "Apply parameter changes" }).click();
  await expect(page.getByText("Preview: r2", { exact: true })).toBeVisible();
  await expect(page.getByText("Changes saved.", { exact: true })).toBeVisible();
  assert.equal(
    controls.requests[0].operations.find((o) => o.id === "style").value,
    2,
  );
  assert.equal(
    controls.requests[0].operations.find((o) => o.id === "enabled").value,
    false,
  );
  assert.equal(controls.requests[0].parentRevision, "r1");
  assert.equal("modelBody" in controls.requests[0], false);
  await page.getByRole("button", { name: "Reset to defaults" }).click();
  await expect(width).toHaveValue("10");
  assert.equal(controls.requests.length, 1);
  await page.getByRole("button", { name: "Discard changes" }).click();
  await expect(width).toHaveValue("30");
  await page.evaluate(() => window.chooseRevision("r1"));
  await expect(width).toHaveValue("20");
  await expect(width).toBeDisabled();
  await page.evaluate(() => window.chooseRevision("r2"));
  await expect(width).toHaveValue("30");
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(width).toBeEnabled();
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
    true,
  );
  assert.deepEqual(errors, []);
});

test("rejection and cancellation retain drafts; interrupted retries keep identity", async ({
  page,
}) => {
  const { controls, errors } = await mountParameterPanel(page);
  const width = page.getByRole("textbox", { name: "Width · mm", exact: true });
  await width.fill("35");
  controls.mode = "reject";
  await page.getByRole("button", { name: "Apply parameter changes" }).click();
  await expect(page.getByRole("alert")).toContainText("Width cannot produce");
  await expect(width).toHaveValue("35");
  await expect(width).toHaveAttribute("aria-invalid", "true");
  await expect(page.getByText("Preview: r1", { exact: true })).toBeVisible();
  controls.mode = "hold";
  await width.fill("36");
  await page.getByRole("button", { name: "Apply parameter changes" }).click();
  await expect(
    page.getByRole("button", { name: "Cancel update" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Cancel update" }).click();
  await expect(page.getByRole("alert")).toContainText("cancelled");
  controls.release?.();
  await expect(width).toHaveValue("36");
  controls.mode = "lost";
  await page.getByRole("button", { name: "Retry interrupted update" }).click();
  await expect(page.getByRole("alert")).toContainText("could not be confirmed");
  const id = controls.requests.at(-1).requestId;
  controls.mode = "success";
  await page.getByRole("button", { name: "Retry interrupted update" }).click();
  await expect(page.getByText("Changes saved.", { exact: true })).toBeVisible();
  assert.equal(controls.requests.at(-1).requestId, id);
  assert.deepEqual(errors, []);
});

test("external revisions preserve drafts and require review of changed or removed definitions", async ({
  page,
}) => {
  const { controls, snapshot } = await mountParameterPanel(page);
  const width = page.getByRole("textbox", { name: "Width · mm", exact: true });
  await width.fill("30");
  await page.getByRole("textbox", { name: "Count", exact: true }).fill("4");
  controls.snapshots.r2 = snapshot(
    "r2",
    controls.snapshots.r1.parameters.map((p) =>
      p.id === "width"
        ? { ...p, value: 25 }
        : p.id === "count"
          ? { ...p, label: "New count" }
          : p,
    ),
  );
  controls.current = "r2";
  await page.evaluate(() => window.refresh());
  await expect(width).toHaveValue("30");
  await expect(width).toBeDisabled();
  await page
    .getByRole("button", { name: "Review draft on latest revision" })
    .click();
  await expect(page.getByRole("alert")).toContainText("Count");
  await expect(
    page.getByRole("textbox", { name: "New count", exact: true }),
  ).toHaveValue("2");
  await expect(
    page.getByRole("button", { name: "Apply parameter changes" }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "I reviewed the changed definitions" })
    .click();
  await page.getByRole("button", { name: "Apply parameter changes" }).click();
  await expect(page.getByText("Changes saved.", { exact: true })).toBeVisible();
  assert.equal(controls.requests[0].parentRevision, "r2");
  assert.deepEqual(controls.requests[0].operations, [
    { op: "set_value", id: "width", value: 30 },
  ]);
});
