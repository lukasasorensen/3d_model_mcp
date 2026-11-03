import { test, expect } from "playwright/test";
import { mountInvitation } from "../fixtures/invitation.fixture.mjs";

test("a session established after opening the form prompts sign-out and preserves the invite on failure", async ({
  page,
}) => {
  await page.route("**/v1/invitations/accept", (route) =>
    route.fulfill({
      status: 409,
      json: { error: { code: "SIGN_OUT_REQUIRED" } },
    }),
  );
  await page.route("**/api/auth/sign-out", (route) =>
    route.fulfill({ status: 503, json: { message: "Unavailable" } }),
  );
  await mountInvitation(page, "AcceptInvitation", { signedInEmail: null });
  await page.getByLabel("Name", { exact: true }).fill("Recipient");
  await page.getByLabel("Password").fill("fictional-password");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByLabel("Password")).toHaveCount(0);
  const signOut = page.getByRole("button", { name: "Sign out and continue" });
  await signOut.click();
  await expect(page.getByRole("alert")).toHaveText(
    "Unable to sign out. Please try again.",
  );
  await expect(signOut).toBeEnabled();
  await expect(page).toHaveURL("https://example.test/invite#fixture-token");
});
