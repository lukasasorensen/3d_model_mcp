import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { chromium } from "playwright";
import { BROWSER_RENDERER } from "../../packages/contracts/dist/index.js";

// Runs only the repository's verified upstream files; no hosted credentials or downloads.
const directory = new URL(
  "../../apps/site/public/vendor/openscad/",
  import.meta.url,
);
const assets = new Map();
const hashes = {};
for (const [name, expected, contentType] of [
  ["openscad.js", BROWSER_RENDERER.openscadGlueSha256, "text/javascript"],
  ["openscad.wasm", BROWSER_RENDERER.openscadWasmSha256, "application/wasm"],
]) {
  const body = await readFile(new URL(name, directory));
  const hash = createHash("sha256").update(body).digest("hex");
  assert.equal(
    hash,
    expected,
    `Unexpected ${name}; run prepare:browser-renderer.`,
  );
  hashes[name] = hash;
  assets.set(`/${name}`, { body, contentType });
}
assets.set("/", {
  body: "<!doctype html><title>OpenSCAD metadata probe</title>",
  contentType: "text/html",
});
const origin = "http://127.0.0.1:43828";
let browser;
const timeout = setTimeout(() => {
  process.exitCode = 1;
  void browser?.close();
}, 30_000);
try {
  browser = await chromium.launch({
    headless: true,
    chromiumSandbox: true,
    timeout: 15_000,
  });
  const context = await browser.newContext({
    serviceWorkers: "block",
    acceptDownloads: false,
  });
  // Fulfill requests in memory: no listener, upstream fetch or filesystem mount.
  await context.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    const asset =
      url.origin === origin && route.request().method() === "GET"
        ? assets.get(url.pathname)
        : undefined;
    if (asset && !url.search) await route.fulfill({ status: 200, ...asset });
    else await route.abort();
  });
  const page = await context.newPage();
  await page.goto(origin);
  const commands = [];
  for (const argument of ["--version", "--info"]) {
    const result = await page.evaluate(async (argument) => {
      const { default: createModule } = await import("/openscad.js");
      const wasmBinary = new Uint8Array(
        await (await fetch("/openscad.wasm")).arrayBuffer(),
      );
      const output = [];
      const record = (line) => {
        if (output.length < 200) output.push(String(line).slice(0, 2000));
      };
      const instance = await createModule({
        noInitialRun: true,
        wasmBinary,
        print: record,
        printErr: record,
      });
      try {
        return { argument, exitCode: instance.callMain([argument]), output };
      } catch (error) {
        return { argument, error: String(error).slice(0, 2000), output };
      }
    }, argument);
    commands.push(result);
  }
  assert.ok(
    commands[1].output.some((line) =>
      line.startsWith(`OpenSCAD Version: ${BROWSER_RENDERER.openscadVersion}`),
    ),
    "The info command did not emit expected build metadata.",
  );
  console.log(
    JSON.stringify(
      {
        openscadVersion: BROWSER_RENDERER.openscadVersion,
        hashes,
        commands,
        limitation:
          "Metadata from the pinned binary is supporting evidence, not a verified source/build association or licensing clearance.",
      },
      null,
      2,
    ),
  );
} finally {
  clearTimeout(timeout);
  await browser?.close();
}
