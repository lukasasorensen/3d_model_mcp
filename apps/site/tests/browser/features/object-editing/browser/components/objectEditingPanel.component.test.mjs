/* global window, document */
import assert from "node:assert/strict";
import { expect } from "playwright/test";
import { test } from "../../../../browser.fixture.mjs";
import { mountObjectEditingPanel } from "../fixtures/objectEditingPanel.fixture.mjs";
import { overlapNextObjectReads } from "../fixtures/overlappingObjectReads.fixture.mjs";

test("unsupported legacy models explain compatibility without offering failed edits", async ({
  page,
}) => {
  const { controls, errors } = await mountObjectEditingPanel(page);
  controls.snapshots.r2 = {
    ...controls.snapshots.r1,
    revision: "r2",
    modelFiles: null,
    unsupportedReason:
      "Object editing is unavailable for this legacy model. BOSL2 include/use imports require source or AI editing. Your saved model, preview and downloads remain available.",
  };
  controls.current = "r2";
  await page.evaluate(() => window.refresh());
  await expect(
    page.getByRole("status").filter({ hasText: "BOSL2" }),
  ).toBeVisible();
  await expect(
    page.getByRole("textbox", { name: "Position X · mm" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Apply object changes", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Copy object", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Paste object", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByText("Operation: idle", { exact: true }),
  ).toBeVisible();
  assert.equal(controls.requests.length, 0);
  assert.deepEqual(errors, []);
});

test("cancel clears invalid numeric text even when no valid edit was staged", async ({
  page,
}) => {
  const { controls, errors } = await mountObjectEditingPanel(page);
  const x = page.getByRole("textbox", { name: "Position X · mm", exact: true });
  await x.fill("-");
  await expect(x).toHaveAttribute("aria-invalid", "true");
  await page
    .getByRole("button", { name: "Cancel object changes", exact: true })
    .click();
  await expect(x).toHaveValue("0");
  await expect(x).toHaveAttribute("aria-invalid", "false");
  assert.equal(controls.requests.length, 0);
  assert.deepEqual(errors, []);
});

test("lost save acknowledgement retries the exact candidate and retains undo history", async ({
  page,
}) => {
  const { controls, errors } = await mountObjectEditingPanel(page);
  const x = page.getByRole("textbox", { name: "Position X · mm", exact: true });
  controls.mode = "lost";
  await x.fill("17");
  await page
    .getByRole("button", { name: "Apply object changes", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Retry saved outcome", exact: true }),
  ).toBeEnabled();
  await expect(page.getByText("Preview: r2", { exact: true })).toBeVisible();
  const requestId = controls.requests[0].requestId;
  controls.mode = "success";
  await page
    .getByRole("button", { name: "Retry saved outcome", exact: true })
    .click();
  await expect(
    page.getByText("Object changes saved.", { exact: true }),
  ).toBeVisible();
  assert.equal(controls.requests[1].requestId, requestId);
  assert.equal(Object.keys(controls.snapshots).length, 2);
  await page
    .getByRole("button", { name: "Undo object edit", exact: true })
    .click();
  await expect(page.getByText("Edit undone.", { exact: true })).toBeVisible();
  await expect(x).toHaveValue("0");
  assert.deepEqual(errors, []);
});

test("object drafts cancel, apply, copy, paste, undo and redo independently", async ({
  page,
}) => {
  const { controls, errors } = await mountObjectEditingPanel(page);
  const x = page.getByRole("textbox", { name: "Position X · mm", exact: true });
  const apply = page.getByRole("button", {
    name: "Apply object changes",
    exact: true,
  });
  await x.fill("12");
  assert.equal(controls.requests.length, 0);
  await page
    .getByRole("button", { name: "Cancel object changes", exact: true })
    .click();
  await expect(x).toHaveValue("0");
  await x.fill("-");
  await expect(x).toHaveAttribute("aria-invalid", "true");
  await expect(apply).toBeDisabled();
  await x.fill("12");
  await apply.click();
  await expect(
    page.getByText("Object changes saved.", { exact: true }),
  ).toBeVisible();
  assert.equal(
    controls.requests[0].modelFiles.objects[0].transform.position[0],
    12,
  );
  await page.getByRole("button", { name: "Copy object", exact: true }).click();
  assert.equal(controls.requests.length, 1);
  await page.getByRole("button", { name: "Paste object", exact: true }).click();
  await expect(
    page.getByRole("combobox", { name: "Selected object" }).locator("option"),
  ).toHaveCount(3);
  await page
    .getByRole("button", { name: "Cancel object changes", exact: true })
    .click();
  await expect(
    page.getByRole("combobox", { name: "Selected object" }).locator("option"),
  ).toHaveCount(2);
  await page.getByRole("button", { name: "Paste object", exact: true }).click();
  await x.fill("40");
  await apply.click();
  await expect(
    page.getByText("Object changes saved.", { exact: true }),
  ).toBeVisible();
  const pasted = controls.snapshots[controls.current].modelFiles;
  assert.equal(pasted.objects.length, 2);
  assert.equal(pasted.files.length, 2);
  assert.equal(
    pasted.objects.find((o) => o.id === "box").transform.position[0],
    12,
  );
  assert.notEqual(pasted.objects[0].fileId, pasted.objects[1].fileId);
  await overlapNextObjectReads(page);
  await page
    .getByRole("button", { name: "Undo object edit", exact: true })
    .click();
  await expect(page.getByText("Edit undone.", { exact: true })).toBeVisible();
  assert.equal(
    controls.snapshots[controls.current].modelFiles.objects.length,
    1,
  );
  await expect(
    page.getByRole("button", { name: "Redo object edit", exact: true }),
  ).toBeEnabled();
  await page
    .getByRole("button", { name: "Undo object edit", exact: true })
    .click();
  await expect(page.getByText("Preview: r5", { exact: true })).toBeVisible();
  await expect(x).toHaveValue("0");
  await overlapNextObjectReads(page);
  await page
    .getByRole("button", { name: "Redo object edit", exact: true })
    .click();
  await expect(page.getByText("Edit redone.", { exact: true })).toBeVisible();
  await expect(x).toHaveValue("12");
  await page
    .getByRole("button", { name: "Redo object edit", exact: true })
    .click();
  await expect(page.getByText("Preview: r7", { exact: true })).toBeVisible();
  assert.equal(
    controls.snapshots[controls.current].modelFiles.objects.length,
    2,
  );
  assert.deepEqual(errors, []);
});

test("an external accepted revision clears local undo and redo history", async ({
  page,
}) => {
  const { controls, errors, snapshot } = await mountObjectEditingPanel(page);
  const x = page.getByRole("textbox", { name: "Position X · mm", exact: true });
  await x.fill("12");
  await page
    .getByRole("button", { name: "Apply object changes", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Undo object edit", exact: true }),
  ).toBeEnabled();
  controls.snapshots.r3 = snapshot("r3");
  controls.current = "r3";
  await page.evaluate(() => window.refresh());
  await expect(page.getByText("Preview: r3", { exact: true })).toBeVisible();
  await expect(x).toHaveValue("0");
  await expect(x).toBeEnabled();
  for (const name of ["Undo object edit", "Redo object edit"])
    await expect(
      page.getByRole("button", { name, exact: true }),
    ).toBeDisabled();
  assert.equal(controls.requests.length, 1);
  assert.deepEqual(errors, []);
});

test("failed validation retains draft and accepted revision; external edits block stale drafts", async ({
  page,
}) => {
  const { controls, errors, snapshot } = await mountObjectEditingPanel(page);
  const x = page.getByRole("textbox", { name: "Position X · mm", exact: true });
  await x.fill("20");
  controls.mode = "reject";
  await page
    .getByRole("button", { name: "Apply object changes", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("validation rejected");
  await expect(x).toHaveValue("20");
  assert.equal(controls.current, "r1");
  controls.snapshots.r2 = snapshot("r2");
  controls.current = "r2";
  await page.evaluate(() => window.refresh());
  await expect(x).toBeDisabled();
  await expect(x).toHaveValue("20");
  await expect(
    page.getByRole("button", { name: "Apply object changes", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "Cancel object changes", exact: true })
    .click();
  await page
    .getByRole("button", {
      name: "Discard draft and reload objects",
      exact: true,
    })
    .click();
  await expect(x).toBeEnabled();
  await expect(x).toHaveValue("0");
  assert.deepEqual(errors, []);
});

test("object controls reflow on mobile and historical views cannot mutate", async ({
  page,
}) => {
  const { controls, errors } = await mountObjectEditingPanel(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Scale", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Uniform scale factor", exact: true })
    .fill("2.5");
  await expect(
    page.getByRole("textbox", { name: "Scale X · factor", exact: true }),
  ).toHaveValue("2.5");
  await page
    .getByRole("button", { name: "Apply object changes", exact: true })
    .click();
  await expect(
    page.getByText("Object changes saved.", { exact: true }),
  ).toBeVisible();
  assert.deepEqual(
    controls.requests[0].modelFiles.objects[0].transform.scale,
    [2.5, 2.5, 2.5],
  );
  await page.evaluate(() => window.chooseRevision("r1"));
  await expect(
    page.getByRole("button", { name: "Copy object", exact: true }),
  ).toBeDisabled();
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
    true,
  );
  assert.deepEqual(errors, []);
});

test("a stalled post-save refresh releases editing and exact retry recovers history", async ({
  page,
}) => {
  const { controls, errors } = await mountObjectEditingPanel(page);
  await page.clock.install();
  await page.evaluate(() => {
    window.stallRefresh = true;
  });
  await page
    .getByRole("textbox", { name: "Position X · mm", exact: true })
    .fill("9");
  await page
    .getByRole("button", { name: "Apply object changes", exact: true })
    .click();
  await expect(
    page.getByText("Changes saved. Refreshing the model…", { exact: true }),
  ).toBeVisible();
  await page.clock.fastForward(15_001);
  await expect(
    page.getByText("Operation: idle", { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("alert")).toContainText(
    "Changes were saved, but the project could not be refreshed",
  );
  await expect(
    page.getByRole("button", { name: "Retry saved outcome", exact: true }),
  ).toBeEnabled();
  const requestId = controls.requests[0].requestId;
  await page.evaluate(() => {
    window.stallRefresh = false;
  });
  await page.clock.resume();
  await page
    .getByRole("button", { name: "Retry saved outcome", exact: true })
    .click();
  await expect(
    page.getByText("Object changes saved.", { exact: true }),
  ).toBeVisible();
  assert.equal(controls.requests[1].requestId, requestId);
  assert.equal(Object.keys(controls.snapshots).length, 2);
  await expect(
    page.getByRole("button", { name: "Undo object edit", exact: true }),
  ).toBeEnabled();
  assert.deepEqual(errors, []);
});

test("an ambiguous undo preserves its immutable request and redo snapshot", async ({
  page,
}) => {
  const { controls, errors } = await mountObjectEditingPanel(page);
  const x = page.getByRole("textbox", { name: "Position X · mm", exact: true });
  await x.fill("13");
  await page
    .getByRole("button", { name: "Apply object changes", exact: true })
    .click();
  await expect(
    page.getByText("Object changes saved.", { exact: true }),
  ).toBeVisible();
  controls.mode = "lost";
  await page
    .getByRole("button", { name: "Undo object edit", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Retry saved outcome", exact: true }),
  ).toBeEnabled();
  await expect(page.getByText("Preview: r3", { exact: true })).toBeVisible();
  const undoRequest = controls.requests[1].requestId;
  controls.mode = "success";
  await page
    .getByRole("button", { name: "Retry saved outcome", exact: true })
    .click();
  await expect(page.getByText("Edit undone.", { exact: true })).toBeVisible();
  assert.equal(controls.requests[2].requestId, undoRequest);
  assert.equal(Object.keys(controls.snapshots).length, 3);
  await page
    .getByRole("button", { name: "Redo object edit", exact: true })
    .click();
  await expect(page.getByText("Edit redone.", { exact: true })).toBeVisible();
  await expect(x).toHaveValue("13");
  assert.deepEqual(errors, []);
});

test("clearing the selected object disables copy until another object is selected", async ({
  page,
}) => {
  const { errors } = await mountObjectEditingPanel(page);
  const selector = page.getByRole("combobox", {
    name: "Selected object",
    exact: true,
  });
  await selector.selectOption("");
  await expect(selector).toHaveValue("");
  await expect(
    page.getByRole("button", { name: "Copy object", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("textbox", { name: "Position X · mm", exact: true }),
  ).toHaveCount(0);
  await selector.selectOption("box");
  await expect(
    page.getByRole("button", { name: "Copy object", exact: true }),
  ).toBeEnabled();
  assert.deepEqual(errors, []);
});
