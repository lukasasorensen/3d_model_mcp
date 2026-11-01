/* global window */
import { expect, test } from "playwright/test";

test("browser project applies its declared accessibility media preferences", async ({
  page,
}, testInfo) => {
  const alternate = testInfo.project.name === "chromium-accessibility";
  const preferences = await page.evaluate(() => ({
    forcedColors: window.matchMedia("(forced-colors: active)").matches,
    reducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)")
      .matches,
  }));
  expect(preferences).toEqual({
    forcedColors: alternate,
    reducedMotion: alternate,
  });
});
