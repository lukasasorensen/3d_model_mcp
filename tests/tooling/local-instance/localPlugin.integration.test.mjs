import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, cp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../../../", import.meta.url));
test("installed Codex loads the local skill without registering a hosted MCP connection", async (t) => {
  if (spawnSync("codex", ["--version"]).status !== 0) {
    t.skip("Codex CLI is not installed");
    return;
  }
  const temporary = await mkdtemp(join(tmpdir(), "tf-local-plugin-"));
  try {
    const built = spawnSync(
      process.execPath,
      [join(root, "tooling/local-instance/buildPlugin.script.mjs")],
      { encoding: "utf8" },
    );
    assert.equal(built.status, 0, built.stderr);
    const marketplace = join(temporary, "marketplace");
    await cp(join(root, "dist/local-plugin"), marketplace, { recursive: true });
    const env = { ...process.env, CODEX_HOME: join(temporary, "codex") };
    await mkdir(env.CODEX_HOME);
    const run = (args) => {
      const result = spawnSync("codex", args, {
        env,
        cwd: temporary,
        encoding: "utf8",
        timeout: 30000,
      });
      assert.equal(result.status, 0, result.stderr);
      return JSON.parse(result.stdout);
    };
    run(["plugin", "marketplace", "add", marketplace, "--json"]);
    const installed = run([
      "plugin",
      "add",
      "theoryfoundry-local@theoryfoundry-local",
      "--json",
    ]);
    assert.equal(installed.name, "theoryfoundry-local");
    assert.equal(
      run(["mcp", "list", "--json"]).some((value) =>
        value.name.startsWith("theoryfoundry"),
      ),
      false,
    );
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});
