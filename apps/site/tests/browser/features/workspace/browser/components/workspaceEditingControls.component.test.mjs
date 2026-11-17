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
  const showLid = page.getByRole("checkbox", {
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
  await showLid.uncheck();
  await expect(applyObject).toBeEnabled();
  await expect(applyLayers).toBeEnabled();
  await expect(applyParameters).toBeEnabled();

  await applyObject.click();
  await expect(
    page.getByText("Workspace operation: pending", { exact: true }),
  ).toBeVisible();
  await expect(showLid).toBeDisabled();
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
  controls.release();
  await expect(
    page.getByText("Workspace operation: idle", { exact: true }),
  ).toBeVisible();
  await expect(
    page
      .getByRole("region", { name: "Layers", exact: true })
      .getByRole("alert"),
  ).toContainText("layers fixture validation failed");
  await expect(position).toBeEnabled();
  await expect(width).toBeEnabled();
  await expect(applyObject).toBeEnabled();
  await expect(applyParameters).toBeEnabled();
  await expect(position).toHaveValue("3");
  await expect(width).toHaveValue("11");
  await expect(showLid).not.toBeChecked();
  assert.deepEqual(errors, []);
});
