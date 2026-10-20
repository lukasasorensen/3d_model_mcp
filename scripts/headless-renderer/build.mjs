import { build } from "esbuild";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = new URL("../../", import.meta.url);
const output = new URL("dist/headless-renderer-proof/", root);
await rm(output, { recursive: true, force: true });
await mkdir(new URL("public/vendor/openscad/", output), { recursive: true });
const common = { bundle: true, format: "esm", target: "es2022", logLevel: "warning" };
// Both hosts import the shared public API and supply their own worker entry.
await build({ ...common, platform: "browser", entryPoints: [fileURLToPath(new URL("scripts/headless-renderer/browser/renderer-bridge.mjs", root))],
  outfile: fileURLToPath(new URL("public/proof.js", output)) });
await build({ ...common, platform: "browser", entryPoints: [fileURLToPath(new URL("scripts/headless-renderer/browser/openscad-worker.mjs", root))], outfile: fileURLToPath(new URL("public/openscad-worker.js", output)) });
await build({ ...common, platform: "node", target: "node22",
  entryPoints: [fileURLToPath(new URL("scripts/headless-renderer/run-proof.mjs", root))],
  // Internal codecs/contracts are bundled, only Playwright remains a dependency.
  external: ["playwright"],
  outfile: fileURLToPath(new URL("cli.mjs", output)) });
for (const name of ["openscad.js", "openscad.wasm", "bosl2.zip", "manifest.json"]) {
  await cp(new URL(`apps/site/public/vendor/openscad/${name}`, root), new URL(`public/vendor/openscad/${name}`, output));
}
const { devDependencies } = JSON.parse(await readFile(new URL("package.json", root), "utf8"));
await writeFile(new URL("package.json", output), JSON.stringify({ name: "theoryfoundry-headless-renderer-proof", version: "0.0.0", private: true, type: "module", engines: { node: ">=22.9.0" }, scripts: { proof: "node cli.mjs" }, dependencies: { playwright: devDependencies.playwright } }, null, 2) + "\n");
await writeFile(new URL("public/index.html", output), '<!doctype html><meta charset="utf-8"><title>Local CAD renderer proof</title><script type="module" src="/proof.js"></script>');
console.log(`Built unpublished renderer proof at ${fileURLToPath(output)}`);
