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
  );
  await expect(
    page.getByRole("heading", { name: "Inspecting R2" }),
  ).toBeVisible();
  const help = page.locator("#export-help");
  await expect(help).toContainText(
    "Downloads use the saved model and visible layers in R2.",
  );
  await expect(help).toContainText("Apply changes before downloading");
  const cutter = page.getByRole("button", {
    name: "Show Cut (cut)",
    exact: true,
  });
  await expect(cutter).toHaveAttribute("aria-pressed", "false");
  await cutter.click();
  await expect(
    page.getByRole("button", { name: "Apply layers", exact: true }),
  ).toBeEnabled();
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
  await page
    .getByRole("button", { name: "Restore R1 as a new revision", exact: true })
    .click();
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
