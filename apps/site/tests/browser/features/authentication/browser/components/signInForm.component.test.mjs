/* global window, document */
import { expect, test } from "playwright/test";
import { mountAuthentication } from "../fixtures/authentication.fixture.mjs";

for (const width of [1440, 320]) {
  test(`sign-in failure, retry and confirmed navigation at ${width}px`, async ({
    page,
  }) => {
    const { controls, errors } = await mountAuthentication(
      page,
      "SignInForm",
      width,
    );
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    expect(controls.requests).toHaveLength(0);
    await page
      .getByLabel("Email", { exact: true })
      .fill("fixture@example.test");
    await page.getByLabel("Password", { exact: true }).fill("fixture-password");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page.getByRole("alert")).toHaveText(
      "The email or password was not accepted.",
    );
    expect(await page.evaluate(() => window.navigation)).toEqual([]);
    controls.mode = "success";
    let release;
    controls.gate = new Promise((resolve) => {
      release = resolve;
    });
    await page.getByLabel("Password", { exact: true }).press("Enter");
    await expect(
      page.getByRole("button", { name: "Signing in…", exact: true }),
    ).toBeDisabled();
    await expect(page.getByRole("alert")).toHaveCount(0);
    expect(await page.evaluate(() => window.navigation)).toEqual([]);
    release();
    await expect
      .poll(() => page.evaluate(() => window.navigation))
      .toEqual([{ type: "replace", path: "/projects" }, { type: "refresh" }]);
    expect(controls.requests).toHaveLength(2);
    expect(controls.requests[1]).toMatchObject({
      method: "POST",
      body: { email: "fixture@example.test", password: "fixture-password" },
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth,
      ),
    ).toBe(false);
    expect(errors).toEqual([]);
  });
}
