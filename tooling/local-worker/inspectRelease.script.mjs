import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { releaseVersion } from "./releaseVersion.util.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
const archive = process.argv[2];
assert.ok(
  archive && process.argv.length === 3,
  "Usage: node tooling/local-worker/inspectRelease.script.mjs <tarball>",
);
const path = resolve(archive);
const bytes = await readFile(path);
const tar = (...args) =>
  execFileSync("tar", args, { maxBuffer: 100 * 1024 * 1024 });
const manifest = JSON.parse(
  tar("-xOzf", path, "package/package.json").toString(),
);
const base = JSON.parse(
  await readFile(
    new URL("../../packages/local-worker/package.json", import.meta.url),
    "utf8",
  ),
).version;
releaseVersion(base, manifest.version);
assert.equal(manifest.name, "@tfoundry/local-worker");
assert.deepEqual(manifest.publishConfig, {
  registry: "https://registry.npmjs.org/",
  access: "public",
});
assert.equal(
  manifest.theoryfoundryBuild?.sourceDirty,
  false,
  "Release must be built from a clean committed checkout.",
);
const commit = execFileSync("git", ["rev-parse", "HEAD"], {
  cwd: root,
  encoding: "utf8",
}).trim();
assert.equal(
  manifest.theoryfoundryBuild.sourceCommit,
  commit,
  "Rebuild the candidate from the checked-out release commit.",
);
assert.equal(
  execFileSync("git", ["status", "--porcelain", "--untracked-files=all"], {
    cwd: root,
    encoding: "utf8",
  }).trim(),
  "",
  "Commit source changes before inspection.",
);
const names = tar("-tzf", path).toString().trim().split("\n");
for (const entry of tar("-tvzf", path).toString().trim().split("\n"))
  assert.ok(
    entry.startsWith("-"),
    "Release archives must contain regular files only.",
  );
assert.equal(new Set(names).size, names.length);
const files = names.map((name) => {
  assert.match(
    name,
    /^package\/(?:dist\/(?:[a-zA-Z0-9_-]+\.js|assets\/(?:integrity\.json|index\.html|proof\.js|openscad-worker\.js|vendor\/openscad\/(?:openscad\.js|openscad\.wasm|bosl2\.zip|manifest\.json)))|licenses\/[a-zA-Z0-9.-]+|package\.json|README\.md|THIRD_PARTY_NOTICES\.md)$/,
  );
  const content = tar("-xOzf", path, name);
  return {
    path: name,
    bytes: content.length,
    sha256: createHash("sha256").update(content).digest("hex"),
  };
});
console.log(
  JSON.stringify(
    {
      name: manifest.name,
      version: manifest.version,
      sourceCommit: commit,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      integrity: `sha512-${createHash("sha512").update(bytes).digest("base64")}`,
      bytes: bytes.length,
      files,
      dependencies: manifest.dependencies,
      publication:
        "Manual release only after licensing and live acceptance gates pass; this inventory does not certify them.",
    },
    null,
    2,
  ),
);
