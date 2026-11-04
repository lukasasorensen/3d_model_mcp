import { expect } from "playwright/test";
import { test } from "../../../../browser.fixture.mjs";
import { mountProjectLanding } from "../fixtures/projectLanding.fixture.mjs";

test("archive, unarchive and confirmed deletion survive reload at phone width", async ({
  page,
}) => {
  const { controls, reload } = await mountProjectLanding(
    page,
    320,
    ["Bracket", "Spool"].map((name) => ({
      projectId: name,
      name,
      description: "Workshop",
    })),
  );
  const button = (name) => page.getByRole("button", { name, exact: true });
  await button("Archive Bracket").focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("link", { name: "Spool" })).toBeFocused();
  await expect(page.getByRole("status")).toHaveText("Bracket archived.");
  await reload();
  await button("Archived (1)").click();
  await expect(page.getByRole("link", { name: "Bracket" })).toHaveAttribute(
    "href",
    "/projects/Bracket",
  );
  await button("Unarchive Bracket").click();
  await expect(
    page.getByRole("heading", { name: "Your projects" }),
  ).toBeFocused();
  await button("Active (2)").click();
  await button("Delete Bracket").focus();
  await page.keyboard.press("Enter");
  await expect(button("Cancel")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(button("Delete Bracket")).toBeFocused();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await button("Delete Bracket").click();
  controls.mutationFails = true;
  await button("Delete project").click();
  await expect(page.getByRole("dialog").getByRole("alert")).toHaveText(
    /try again/,
  );
  controls.mutationFails = false;
  await button("Delete project").click();
  await expect(page.getByRole("link", { name: "Spool" })).toBeFocused();
  await expect(page.getByRole("status")).toHaveText("Bracket deleted.");
  await reload();
  await expect(button("Active (1)")).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("link", { name: "Bracket" })).toHaveCount(0);
  await button("Archive Spool").click();
  await button("Archived (1)").click();
  await button("Delete Spool").click();
  await button("Delete project").click();
  await expect(
    page.getByRole("heading", { name: "No archived projects" }),
  ).toBeVisible();
});
