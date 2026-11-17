/* global window */
import { readFile } from "node:fs/promises";
import { expect, test } from "playwright/test";
import { mountWorkspaceJourney } from "../fixtures/workspaceJourney.fixture.mjs";

test("legacy BOSL2 compatibility notice leaves saved preview and downloads available", async ({
  page,
}) => {
  const { controls, errors, sources } = await mountWorkspaceJourney(
    page,
    1440,
    false,
    false,
    true,
  );
  await expect(
    page.getByRole("status").filter({ hasText: "BOSL2" }),
  ).toBeVisible();
  await expect(page.getByLabel("Preview fixture")).toHaveText("r2");
  await expect(
    page.getByRole("button", { name: "Apply object changes", exact: true }),
  ).toHaveCount(0);
  const pending = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download STL · R2", exact: true })
    .click();
  const file = await pending;
  expect(await readFile(await file.path(), "utf8")).toBe(sources.r2);
  expect(controls.current).toBe("r2");
  expect(controls.restoreRequests).toEqual([]);
  expect(errors).toEqual([]);
});

for (const width of [1440, 390]) {
  test(`revision inspection, restore and verified download at ${width}px`, async ({
    page,
  }) => {
    const { controls, errors } = await mountWorkspaceJourney(page, width);
    await expect(
      page.getByRole("heading", { name: "Inspecting R2" }),
    ).toBeVisible();
    const sections = page.getByRole("navigation", {
      name: "Workspace sections",
    });
    const section = async (name) => {
      if (width < 1024)
        await sections.getByRole("button", { name, exact: true }).click();
    };
    await section("Details");
    await page.locator(".revision-history summary").click();
    await page.getByRole("button", { name: /R1 Historical revision/ }).click();
    await expect(
      page.getByRole("heading", { name: "Inspecting R1" }),
    ).toBeVisible();
    await page.locator(".model-source-panel summary").click();
    await expect(page.getByLabel("OpenSCAD source for R1")).toHaveText(
      "cube(10);",
    );
    await section("Model");
    const download = page.getByRole("button", {
      name: "Download STL · R2",
      exact: true,
    });
    await expect(download).toBeEnabled();
    const downloaded = page.waitForEvent("download");
    await download.click();
    const file = await downloaded;
    expect(await readFile(await file.path(), "utf8")).toBe("cube(20);");
    expect(await page.evaluate(() => window.generatedSource)).toBe("cube(20);");
    expect(file.suggestedFilename()).toContain("r2");

    controls.corruptSource = true;
    const downloads = [];
    page.on("download", (item) => downloads.push(item));
    await download.click();
    await expect(
      page
        .getByRole("alert")
        .filter({ hasText: "The export could not be verified" }),
    ).toBeVisible();
    expect(downloads).toHaveLength(0);
    controls.corruptSource = false;

    await section("Details");
    controls.failRestore = true;
    const restore = page.getByRole("button", {
      name: "Restore R1 as a new revision",
      exact: true,
    });
    await expect(restore).toBeEnabled();
    await restore.click();
    await expect(
      page
        .getByRole("alert")
        .filter({ hasText: "could not be restored safely" }),
    ).toBeVisible();
    expect(controls.current).toBe("r2");
    await expect(page.locator(".current-badge")).toHaveText("Current · R2");
    controls.failRestore = false;
    await expect(restore).toBeEnabled();
    await restore.click();
    await expect(page.locator(".current-badge")).toHaveText("Current · R3");
    await expect(
      page.getByRole("heading", { name: "Inspecting R1" }),
    ).toBeVisible();
    expect(controls.restoreRequests).toEqual([
      { path: "/v1/projects/sample/revisions/r1/restore", method: "POST" },
      { path: "/v1/projects/sample/revisions/r1/restore", method: "POST" },
    ]);
    await section("Model");
    await expect(
      page.getByRole("button", { name: "Download STL · R3", exact: true }),
    ).toBeEnabled();
    await expect(
      page
        .getByRole("alert")
        .filter({ hasText: "could not be restored safely" }),
    ).toHaveCount(0);
    expect(errors).toEqual([]);
  });
}

test("parameter controls sit beside the preview without AI chat and drafts do not enter downloads", async ({
  page,
}) => {
  const { errors } = await mountWorkspaceJourney(page, 1440, true);
  const field = page.getByRole("textbox", { name: "Width", exact: true });
  await expect(field).toHaveValue("20");
  const preview = await page.getByLabel("Preview fixture").boundingBox();
  const panel = await page
    .getByRole("region", { name: "Parameters", exact: true })
    .boundingBox();
  expect(panel.x).toBeGreaterThanOrEqual(preview.x + preview.width);
  await page.screenshot({
    path: test.info().outputPath("parameter-workspace.png"),
  });
  await field.fill("30");
  const pending = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download STL · R2", exact: true })
    .click();
  const file = await pending;
  expect(await readFile(await file.path(), "utf8")).toBe("cube(20);");
  await expect(field).toHaveValue("30");
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(field).toBeVisible();
  await page
    .getByRole("navigation", { name: "Workspace sections" })
    .getByRole("button", { name: "Details", exact: true })
    .click();
  await expect(field).not.toBeVisible();
  expect(errors).toEqual([]);
});
