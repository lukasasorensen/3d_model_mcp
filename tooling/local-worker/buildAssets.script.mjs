import { createHash } from "node:crypto";
import { build } from "esbuild";
import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
const root = new URL("../../", import.meta.url);
const output = new URL("packages/local-worker/dist/assets/", root);
await mkdir(new URL("vendor/openscad/", output), { recursive: true });
for (const [source, destination] of [
  ["renderer/bridge.adapter.mjs", "proof.js"],
  ["worker/openscad.worker.mjs", "openscad-worker.js"],
]) {
  await build({
    bundle: true,
    platform: "browser",
    format: "esm",
    target: "es2022",
    entryPoints: [
      fileURLToPath(
        new URL(`tooling/headless-renderer/browser/${source}`, root),
      ),
    ],
    outfile: fileURLToPath(new URL(destination, output)),
    logLevel: "warning",
  });
}
for (const name of [
  "openscad.js",
  "openscad.wasm",
  "bosl2.zip",
  "manifest.json",
])
  await cp(
    new URL(`apps/site/public/vendor/openscad/${name}`, root),
    new URL(`vendor/openscad/${name}`, output),
  );
await writeFile(
  new URL("index.html", output),
  '<!doctype html><meta charset="utf-8"><title>TheoryFoundry local renderer</title><script type="module" src="/proof.js"></script>',
);
console.log("Built local worker renderer assets.");

const integrity = {};
for (const file of [
  "index.html",
  "proof.js",
  "openscad-worker.js",
  "vendor/openscad/openscad.js",
  "vendor/openscad/openscad.wasm",
  "vendor/openscad/bosl2.zip",
  "vendor/openscad/manifest.json",
])
  integrity[file] = createHash("sha256")
    .update(await readFile(new URL(file, output)))
    .digest("hex");
await writeFile(
  new URL("integrity.json", output),
  JSON.stringify(integrity, null, 2) + "\n",
);
