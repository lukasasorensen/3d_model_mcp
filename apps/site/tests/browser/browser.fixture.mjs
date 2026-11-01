import { fileURLToPath } from "node:url";
import { readFile } from "node:fs/promises";
export { test } from "playwright/test";
export const root = fileURLToPath(new URL("../../../../", import.meta.url));
export async function applicationStyles() {
  let styles = "";
  for (const [, path] of (
    await readFile(root + "/apps/site/src/app/styles.css", "utf8")
  ).matchAll(/@import "(.+)"/g))
    styles += await readFile(root + "/apps/site/src/app/" + path, "utf8");
  return styles;
}
