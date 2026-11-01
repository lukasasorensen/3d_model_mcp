/* global window */
import { readFile } from "node:fs/promises";
import { expect, test } from "playwright/test";
import { mountWorkspaceJourney } from "../fixtures/workspaceJourney.fixture.mjs";

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
