import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

test("MCP metadata generation detects manifest drift and repairs both runtime identities", async () => {
  const directory = await mkdtemp(join(tmpdir(), "mcp-metadata-"));
  try {
    for (const path of [
      "tooling/releases",
      "packages/mcp/src/shared",
      "packages/local-worker",
      "packages/contracts/src/domains/worker",
    ])
      await mkdir(join(directory, path), { recursive: true });
    const script = join(
      directory,
      "tooling/releases/generateMcpMetadata.script.mjs",
    );
    await copyFile(
      new URL(
        "../../../tooling/releases/generateMcpMetadata.script.mjs",
        import.meta.url,
      ),
      script,
    );
    const hosted = { mcpServerName: "hosted-fixture", version: "1.2.3" };
    const worker = { mcpServerName: "worker-fixture", version: "4.5.6" };
    for (const [name, manifest] of [
      ["mcp", hosted],
      ["local-worker", worker],
    ])
      await writeFile(
        join(directory, `packages/${name}/package.json`),
        JSON.stringify(manifest),
      );
    const run = (...args) =>
      spawnSync(process.execPath, [script, ...args], { encoding: "utf8" });
    assert.notEqual(run("--check").status, 0);
    assert.equal(run().status, 0);
    assert.equal(run("--check").status, 0);
    worker.version = "4.5.7";
    hosted.mcpServerName = "renamed-fixture";
    for (const [name, manifest] of [
      ["mcp", hosted],
      ["local-worker", worker],
    ])
      await writeFile(
        join(directory, `packages/${name}/package.json`),
        JSON.stringify(manifest),
      );
    assert.notEqual(run("--check").status, 0);
    assert.equal(run().status, 0);
    assert.equal(run("--check").status, 0);
    const identity = await readFile(
      join(directory, "packages/mcp/src/shared/mcpIdentity.constants.ts"),
      "utf8",
    );
    const release = await readFile(
      join(
        directory,
        "packages/contracts/src/domains/worker/workerRelease.constants.ts",
      ),
      "utf8",
    );
    assert.ok(identity.includes(JSON.stringify(hosted.mcpServerName)));
    assert.ok(release.includes(JSON.stringify(worker.version)));
    assert.ok(release.includes(JSON.stringify(worker.mcpServerName)));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
