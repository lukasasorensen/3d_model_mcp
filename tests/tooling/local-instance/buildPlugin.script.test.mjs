import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  access,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { unzipSync, strFromU8 } from "fflate";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const pluginPath = "plugins/theoryfoundry-local";
const codexManifestPath = `${pluginPath}/.codex-plugin/plugin.json`;
const readJson = async (path) => JSON.parse(await readFile(path, "utf8"));

async function withFixture(run) {
  const fixture = await mkdtemp(join(tmpdir(), "tf-plugin-version-"));
  try {
    for (const file of [
      "package.json",
      "packages/local-worker/package.json",
      "tooling/local-instance/buildPlugin.script.mjs",
    ]) {
      const destination = join(fixture, file);
      await mkdir(join(destination, ".."), { recursive: true });
      await cp(join(root, file), destination);
    }
    await cp(join(root, pluginPath), join(fixture, pluginPath), {
      recursive: true,
    });
    await symlink(
      join(root, "node_modules"),
      join(fixture, "node_modules"),
      "dir",
    );
    const application = await readJson(join(fixture, "package.json"));
    const build = () =>
      spawnSync(
        process.execPath,
        [join(fixture, "tooling/local-instance/buildPlugin.script.mjs")],
        { encoding: "utf8" },
      );
    await run(fixture, application.version, build);
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
}

test("local plugin packaging preserves matching versions in both copied and archived manifests", async () => {
  await withFixture(async (fixture, version, build) => {
    const result = build();
    assert.equal(result.status, 0, result.stderr);
    const output = join(fixture, "dist/local-plugin");
    const archive = unzipSync(
      await readFile(join(output, `theoryfoundry-local-${version}.zip`)),
    );
    for (const file of ["plugin.json", ".codex-plugin/plugin.json"]) {
      assert.equal(
        (await readJson(join(output, "plugin", file))).version,
        version,
      );
      assert.equal(JSON.parse(strFromU8(archive[file])).version, version);
    }
  });
});

for (const file of [
  codexManifestPath,
  `${pluginPath}/plugin.json`,
  `${pluginPath}/runtime.metadata.json`,
])
  test(`local plugin packaging rejects version drift in ${file} before writing output`, async () => {
    await withFixture(async (fixture, _version, build) => {
      const manifest = await readJson(join(fixture, file));
      await writeFile(
        join(fixture, file),
        JSON.stringify({ ...manifest, version: "0.0.0-test-mismatch" }),
      );
      const result = build();
      assert.notEqual(result.status, 0);
      assert.ok(
        result.stderr.includes("Local plugin/runtime pins are out of sync."),
      );
      await assert.rejects(access(join(fixture, "dist/local-plugin")), {
        code: "ENOENT",
      });
    });
  });
