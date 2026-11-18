/* global document */
import { expect } from "playwright/test";
import { test } from "../../../../browser.fixture.mjs";
import { mountWorkspaceJourney } from "../fixtures/workspaceJourney.fixture.mjs";

const saveButton = (page) =>
  page.getByRole("button", { name: "Save new revision", exact: true });
const history = (page) => page.getByTestId("revision-history");

async function openParameters(page) {
  const panel = page.getByRole("button", {
    name: "Parameters panel",
    exact: true,
  });
  if ((await panel.getAttribute("aria-expanded")) !== "true")
    await panel.click();
  return page.getByRole("textbox", { name: "Width", exact: true });
}

test("mixed edits preview without history, survive reload and reconcile a lost Save reply", async ({
  page,
}) => {
  const fixture = await mountWorkspaceJourney(
    page,
    390,
    true,
    false,
    false,
    true,
    true,
  );
  const { controls, errors, openWorkspace } = fixture;
  let width = await openParameters(page);
  await expect(width).toHaveValue("20");
  await width.fill("30");
  await expect(saveButton(page)).toBeEnabled();
  await expect(history(page).locator("summary")).toHaveText(
    "Revision history 2",
  );
  await expect(page.getByRole("button", { name: /^Apply/ })).toHaveCount(0);

  await page
    .getByRole("combobox", { name: "Selected object" })
    .selectOption("main-object");
  const position = page.getByRole("textbox", {
    name: "Position X · mm",
    exact: true,
  });
  await position.fill("4");
  await expect(saveButton(page)).toBeEnabled();
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(position).toHaveValue("0");
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await expect(position).toHaveValue("4");
  await expect(saveButton(page)).toBeEnabled();

  await width.fill("");
  await expect(width).toHaveAttribute("aria-invalid", "true");
  await expect(saveButton(page)).toBeDisabled();
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(width).toHaveValue("30");
  await expect(saveButton(page)).toBeEnabled();

  controls.rejectPreviewWidth = 33;
  await width.fill("33");
  await expect(page.getByText(/The test model is empty/)).toBeVisible();
  await expect(page.getByLabel("Preview fixture")).toHaveAttribute(
    "data-draft-mesh",
    "true",
  );
  await expect(saveButton(page)).toBeDisabled();
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(width).toHaveValue("30");
  await expect(saveButton(page)).toBeEnabled();

  await page.getByRole("button", { name: /^Actions for Main object/ }).click();
  await page.getByRole("menuitem", { name: "Rename" }).click();
  const rename = page.getByRole("textbox", { name: /^Rename Main object/ });
  await rename.fill("Working body");
  await expect(saveButton(page)).toBeDisabled();
  await rename.press("Enter");
  await expect(
    page.getByRole("button", { name: /^Select Working body/ }),
  ).toBeVisible();
  const move = page.getByRole("button", { name: "Move selected object" });
  await move.focus();
  await page.keyboard.press("ControlOrMeta+c");
  await page.keyboard.press("ControlOrMeta+v");
  await expect(
    page.getByRole("button", { name: /^Select Working body copy/ }),
  ).toBeVisible();
  await expect(saveButton(page)).toBeEnabled();

  await page.setViewportSize({ width: 320, height: 900 });
  await expect(saveButton(page)).toBeVisible();
  const fits = await saveButton(page).evaluate((button) => {
    const bounds = button.getBoundingClientRect();
    return (
      bounds.left >= 0 && bounds.right <= document.documentElement.clientWidth
    );
  });
  expect(fits).toBe(true);

  page.once("dialog", (dialog) => dialog.accept());
  await openWorkspace();
  width = await openParameters(page);
  await expect(width).toHaveValue("30");
  await expect(saveButton(page)).toBeEnabled();
  expect(
    controls.previews.at(-1).modelFiles.objects[0].transform.position[0],
  ).toBe(4);

  controls.loseNextSaveResponse = true;
  await saveButton(page).focus();
  await page.keyboard.press("Enter");
  await expect(
    page.getByText("Revision saved.", { exact: true }),
  ).toBeVisible();
  await expect(history(page).locator("summary")).toHaveText(
    "Revision history 3",
  );
  expect(controls.saves).toHaveLength(1);
  expect(
    controls.saves[0].modelFiles.objects.map((object) => object.name).sort(),
  ).toEqual(["Working body", "Working body copy"]);
  await expect(saveButton(page)).toBeDisabled();
  expect(errors).toEqual([]);
});

test("a changed head keeps an unsaved draft visible and read-only", async ({
  page,
}) => {
  const { controls, errors } = await mountWorkspaceJourney(
    page,
    1440,
    true,
    false,
    false,
    true,
    true,
  );
  const width = await openParameters(page);
  await expect(width).toHaveValue("20");
  await width.fill("31");
  await expect(saveButton(page)).toBeEnabled();
  await history(page).locator("summary").click();
  await history(page)
    .locator(".revision-select")
    .filter({ hasText: "r1" })
    .click();
  await expect(width).toHaveValue("10");
  await expect(width).toBeDisabled();
  await page.getByRole("button", { name: "Return to draft" }).click();
  await expect(width).toHaveValue("31");
  await expect(saveButton(page)).toBeEnabled();
  controls.current = "r3";
  await page.evaluate(() =>
    document.dispatchEvent(new Event("visibilitychange")),
  );
  await expect(
    page.getByText("A newer revision is current. This draft is read-only."),
  ).toBeVisible();
  await expect(width).toHaveValue("31");
  await expect(width).toBeDisabled();
  await expect(saveButton(page)).toBeDisabled();
  expect(controls.saves).toHaveLength(0);
  page.once("dialog", (dialog) => dialog.accept());
  await page
    .getByRole("button", { name: "Discard draft and open latest" })
    .click();
  await expect(width).toHaveValue("10");
  await expect(width).toBeEnabled();
  expect(errors).toEqual([]);
});

test.describe("touch and storage recovery", () => {
  test.use({ hasTouch: true });

  test("warns when the tab cannot keep a draft and supports touch Save", async ({
    page,
  }) => {
    const { controls, errors } = await mountWorkspaceJourney(
      page,
      390,
      true,
      false,
      false,
      true,
      true,
    );
    await page.evaluate(() => {
      const setItem = Storage.prototype.setItem;
      Storage.prototype.setItem = function (key, value) {
        if (key.startsWith("theoryfoundry-working-model:"))
          throw new Error("Fixture storage unavailable");
        return setItem.call(this, key, value);
      };
    });
    const width = await openParameters(page);
    await expect(width).toHaveValue("20");
    await width.fill("25");
    await expect(
      page.getByText(/This tab could not store your draft/),
    ).toBeVisible();
    const guard = page.waitForEvent("dialog");
    const leave = page
      .getByRole("button", { name: "All projects", exact: true })
      .click();
    const dialog = await guard;
    expect(dialog.message()).toMatch(/Leave and discard/);
    await dialog.dismiss();
    await leave;
    await expect(width).toHaveValue("25");
    await expect(saveButton(page)).toBeEnabled();
    await saveButton(page).tap();
    await expect(
      page.getByText("Revision saved.", { exact: true }),
    ).toBeVisible();
    expect(controls.saves).toHaveLength(1);
    expect(errors).toEqual([]);
  });
});
