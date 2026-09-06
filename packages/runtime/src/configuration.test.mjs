import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

test("root provisioning forwards exactly the caller arguments", async () => {
  const manifest = JSON.parse(await readFile(new URL("../../../package.json", import.meta.url), "utf8"));
  assert.equal(manifest.scripts["auth:provision"], "pnpm build:packages && dotenv --no-expand -e apps/site/.env.local -- pnpm --filter @rjls/runtime auth:provision");
});

test("local CLI environment loading preserves overrides, literal secrets, and caller arguments", async () => {
  const manifest = JSON.parse(await readFile(new URL("../../../package.json", import.meta.url), "utf8"));
  const fixtureRoot = await mkdtemp(join(tmpdir(), "rjls-cli-env-"));
  const dotenv = fileURLToPath(new URL("../../../node_modules/.bin/dotenv", import.meta.url));
  try {
    await mkdir(join(fixtureRoot, "apps/site"), { recursive: true });
    await writeFile(join(fixtureRoot, "apps/site/.env.local"), 'RJLS_TEST_FILE_VALUE="local value"\nRJLS_TEST_OVERRIDE=file\nRJLS_TEST_SECRET="literal$VALUE"\n');
    const probe = `
      const assert = require("node:assert/strict");
      assert.equal(process.env.RJLS_TEST_FILE_VALUE, "local value");
      assert.equal(process.env.RJLS_TEST_OVERRIDE, "caller");
      assert.equal(process.env.RJLS_TEST_SECRET, "literal$VALUE");
      assert.equal(process.env.RJLS_TEST_CALLER_SECRET, "caller$VALUE");
      assert.deepEqual(process.argv.slice(1), ["user@example.com", "Demo User", "--replace"]);
    `;
    for (const command of ["db:migrate", "auth:provision", "oauth:provision", "mcp:serve"]) {
      const loader = manifest.scripts[command].split(" && ").at(-1).split(" -- ")[0].split(" ");
      assert.equal(loader.shift(), "dotenv");
      const result = spawnSync(dotenv, [...loader, "--", process.execPath, "-e", probe, "--", "user@example.com", "Demo User", "--replace"], {
        cwd: fixtureRoot,
        env: { PATH: process.env.PATH, RJLS_TEST_OVERRIDE: "caller", RJLS_TEST_CALLER_SECRET: "caller$VALUE" },
        encoding: "utf8",
      });
      assert.equal(result.status, 0, `${command}: ${result.stderr}`);
      assert.equal(result.stdout, "", "environment loading must not write to MCP stdout");
    }
    await rm(join(fixtureRoot, "apps/site/.env.local"));
    const result = spawnSync(dotenv, ["--no-expand", "-e", "apps/site/.env.local", "--", process.execPath, "-e", 'require("node:assert/strict").equal(process.env.RJLS_TEST_OVERRIDE, "caller"); process.exitCode = 7;'], {
      cwd: fixtureRoot,
      env: { PATH: process.env.PATH, RJLS_TEST_OVERRIDE: "caller" },
      encoding: "utf8",
    });
    assert.equal(result.status, 7, result.stderr);
    assert.equal(result.stdout, "");
  } finally {
    await rm(fixtureRoot, { recursive: true, force: true });
  }
});

test("standalone MCP shutdown closes its PostgreSQL pool on normal and failed startup", async () => {
  const source = await readFile(new URL("./stdio-server.ts", import.meta.url), "utf8");
  assert.equal(source.match(/database\.close\(\)/g)?.length, 2);
});
