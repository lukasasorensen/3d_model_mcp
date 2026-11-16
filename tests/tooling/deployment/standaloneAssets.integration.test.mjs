import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

const workspace = resolve(import.meta.dirname, "../../..");
const site = "apps/site";
const standalone = `${site}/.next/standalone/${site}`;

function standaloneCopyCommand(dockerfile) {
  const start = dockerfile.indexOf("RUN mkdir -p apps/site/.next/standalone/");
  assert.notEqual(start, -1, "Dockerfile must prepare standalone assets");
  return dockerfile.slice(start + 4, dockerfile.indexOf("\n\n", start));
}

test("standalone packaging merges assets into directories already created by tracing", async () => {
  const root = await mkdtemp(join(tmpdir(), "standalone-assets-"));
  try {
    const fixtures = {
      [`${site}/public/vendor/openscad/openscad.wasm`]: "pinned-wasm",
      [`${site}/public/vendor/openscad/openscad.js`]: "pinned-glue",
      [`${site}/public/vendor/openscad/bosl2.zip`]: "pinned-bosl2",
      [`${site}/public/vendor/openscad/.complete`]: "verified",
      [`${site}/.next/static/chunks/worker.js`]: "worker-bootstrap",
      [`${standalone}/public/vendor/openscad/manifest.json`]: "traced-manifest",
      [`${standalone}/.next/static/chunks/traced.js`]: "traced-chunk",
    };
    for (const [path, content] of Object.entries(fixtures)) {
      await mkdir(resolve(root, path, ".."), { recursive: true });
      await writeFile(join(root, path), content);
    }
    const command = standaloneCopyCommand(
      await readFile(join(workspace, "Dockerfile"), "utf8"),
    );
    for (let attempt = 0; attempt < 2; attempt++) {
      const result = spawnSync("sh", ["-ec", command], {
        cwd: root,
        encoding: "utf8",
      });
      assert.equal(result.status, 0, result.stderr);
      for (const [path, content] of Object.entries(fixtures)) {
        const destination = path.startsWith(standalone)
          ? path
          : path.replace(site, standalone);
        assert.equal(await readFile(join(root, destination), "utf8"), content);
      }
      await assert.rejects(
        readFile(
          join(root, standalone, "public/public/vendor/openscad/openscad.wasm"),
        ),
        { code: "ENOENT" },
      );
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
