/* global window, document */
import { expect, test } from "playwright/test";
import { mountAuthentication } from "../fixtures/authentication.fixture.mjs";

for (const width of [1440, 320]) {
  for (const accept of [true, false]) {
    test(`authorization ${accept ? "allow" : "deny"} failure and retry at ${width}px`, async ({
      page,
    }) => {
      const { controls, errors } = await mountAuthentication(
        page,
        "OAuthConsent",
        width,
      );
      const action = page.getByRole("button", {
        name: accept ? "Allow access" : "Deny",
        exact: true,
      });
      await action.click();
      await expect(page.getByRole("alert")).toHaveText(
        "Authorization failed. Restart the login from Codex.",
      );
      await expect(action).toBeEnabled();
      controls.mode = "success";
      let release;
      controls.gate = new Promise((resolve) => {
        release = resolve;
      });
      await action.focus();
      await page.keyboard.press("Enter");
      await expect(action).toBeDisabled();
      await expect(page.getByRole("alert")).toHaveCount(0);
      await expect(page.getByRole("status")).toHaveText(
        "Submitting your choice…",
      );
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth > window.innerWidth,
        ),
      ).toBe(false);
      expect(page.url()).toContain("/consent?");
      release();
      await page.waitForURL("https://example.test/authorized");
      await expect(
        page.getByRole("heading", { name: "Authorization complete" }),
      ).toBeVisible();
      expect(controls.requests).toHaveLength(2);
      for (const request of controls.requests)
        expect(request).toEqual({
          path: "/api/auth/oauth2/consent",
          method: "POST",
          body: {
            accept,
            oauth_query:
              "sig=fixture-signature&redirect_uri=https%3A%2F%2Funtrusted.invalid",
          },
        });
      expect(errors).toEqual([]);
    });
  }
}
