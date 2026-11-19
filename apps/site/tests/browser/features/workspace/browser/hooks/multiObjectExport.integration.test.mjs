import { readFile } from "node:fs/promises";
import { expect, test } from "playwright/test";
import { mountWorkspaceJourney } from "../fixtures/workspaceJourney.fixture.mjs";

test("composed downloads pin accepted source and restore changes the exported composition", async ({
  page,
}) => {
  const { controls, errors, sources } = await mountWorkspaceJourney(
    page,
    1440,
    false,
    true,
    false,
    false,
    true,
  );
  await expect(
    page.getByRole("heading", { name: "Inspecting R2" }),
  ).toBeVisible();
  const help = page.locator("#export-help");
  await expect(help).toContainText(
    "Downloads use the saved model and visible layers in R2.",
  );
  await expect(help).toContainText(
    "Save a new revision to include unsaved edits",
  );
  const cutter = page.getByRole("button", {
    name: "Show Cut (cut)",
    exact: true,
  });
  const preview = page.getByLabel("Preview fixture");
  const save = page.getByRole("button", {
    name: "Save new revision",
    exact: true,
  });
  const base = page.getByRole("button", {
    name: "Show Body (body)",
    exact: true,
  });
  await base.click();
  await expect(preview).toHaveAttribute("data-model-visible", "false");
  await expect(
    page.getByText("Show the first difference operand to preview and save."),
  ).toBeVisible();
  await expect(save).toBeDisabled();
  await base.click();
  await expect(preview).toHaveAttribute("data-model-visible", "true");
  await expect(save).toHaveCount(0);
  await expect(cutter).toHaveAttribute("aria-pressed", "false");
  await cutter.click();
  await expect(cutter).toHaveAttribute("aria-pressed", "true");
  await expect(save).toBeEnabled();
  await expect(preview).toHaveAttribute("data-draft-mesh", "true");
  expect(
    controls.previews.at(-1).modelFiles.presentation.hiddenObjectIds,
  ).toEqual([]);
  await cutter.click();
  await expect(cutter).toHaveAttribute("aria-pressed", "false");
  await expect(preview).toHaveAttribute("data-draft-mesh", "false");
  await expect(save).toHaveCount(0);
  await cutter.click();
  await expect(save).toBeEnabled();
  const draftDownload = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download STL · R2", exact: true })
    .click();
  expect(await readFile(await (await draftDownload).path(), "utf8")).toBe(
    sources.r2,
  );
  expect(controls.sourceRequests.at(-1)).toBe("r2");
  await page.locator(".revision-history summary").click();
  await page.getByRole("button", { name: /R1 Historical revision/ }).click();
  await expect(
    page.getByRole("heading", { name: "Inspecting R1" }),
  ).toBeVisible();
  await page
    .getByRole("combobox", { name: "Download format" })
    .selectOption("3mf");
  const firstDownload = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download 3MF · R2", exact: true })
    .click();
  const first = await firstDownload;
  expect(await readFile(await first.path(), "utf8")).toBe(sources.r2);
  expect(controls.sourceRequests.at(-1)).toBe("r2");
  expect(first.suggestedFilename()).toContain("r2");
  expect(first.suggestedFilename()).toContain(".3mf");
  const restore = page.getByRole("button", {
    name: "Restore R1 as a new revision",
    exact: true,
  });
  await expect(restore).toBeDisabled();
  await page
    .getByRole("button", { name: "Return to draft", exact: true })
    .click();
  page.once("dialog", (dialog) => dialog.accept());
  await page
    .getByRole("button", { name: "Discard draft", exact: true })
    .click();
  await page.getByRole("button", { name: /R1 Historical revision/ }).click();
  await restore.click();
  await expect(page.locator(".current-badge")).toHaveText("Current · R3");
  const restoredDownload = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download 3MF · R3", exact: true })
    .click();
  const restored = await restoredDownload;
  expect(await readFile(await restored.path(), "utf8")).toBe(sources.r1);
  expect(controls.sourceRequests.at(-1)).toBe("r3");
  expect(restored.suggestedFilename()).toContain("r3");
  expect(errors).toEqual([]);
});
