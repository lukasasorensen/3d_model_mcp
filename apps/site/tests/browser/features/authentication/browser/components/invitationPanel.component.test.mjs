import { test, expect } from "playwright/test";
import { mountInvitation } from "../fixtures/invitation.fixture.mjs";

test("the current link survives failures and unrelated revocations, and clears on its own revocation", async ({
  page,
}) => {
  const rows = ["alice", "bob"].map((id) => ({
    id,
    email: `${id}@example.test`,
    creator: "Admin",
    expiresAt: "2026-11-10T00:00:00Z",
    status: "pending",
  }));
  let issuedCount = 0;
  await page.route("**/v1/admin/invitations", async (route) => {
    if (route.request().method() === "DELETE")
      return route.fulfill({ json: { revoked: true } });
    if (issuedCount++ === 1)
      return route.fulfill({
        status: 409,
        json: { error: { message: "Account already exists." } },
      });
    const row = rows[issuedCount === 1 ? 0 : 1];
    return route.fulfill({
      json: {
        id: row.id,
        email: row.email,
        link: `https://example.test/invite#${row.id}`,
      },
    });
  });
  await mountInvitation(page, "InvitationPanel", { invitations: rows });
  const issue = async (email) => {
    await page.getByLabel("Recipient email").fill(email);
    await page.getByRole("button", { name: "Create invitation" }).click();
  };
  await issue(rows[0].email);
  const alice = page.getByLabel("Invitation link for alice@example.test");
  await expect(alice).toHaveValue("https://example.test/invite#alice");
  await issue("existing@example.test");
  await expect(page.getByRole("status")).toHaveText("Account already exists.");
  await expect(alice).toHaveValue("https://example.test/invite#alice");
  await page
    .getByRole("listitem")
    .filter({ hasText: rows[1].email })
    .getByRole("button", { name: "Revoke" })
    .click();
  await expect(page.getByRole("status")).toHaveText("Invitation revoked.");
  await expect(alice).toHaveValue("https://example.test/invite#alice");
  await issue(rows[1].email);
  await expect(alice).toHaveCount(0);
  const bob = page.getByLabel("Invitation link for bob@example.test");
  await expect(bob).toHaveValue("https://example.test/invite#bob");
  await page
    .getByRole("listitem")
    .filter({ hasText: rows[1].email })
    .getByRole("button", { name: "Revoke" })
    .click();
  await expect(bob).toHaveCount(0);
});
