import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("root provisioning forwards exactly the caller arguments", async () => {
  const manifest = JSON.parse(await readFile(new URL("../../../package.json", import.meta.url), "utf8"));
  assert.equal(manifest.scripts["auth:provision"], "pnpm build:packages && pnpm --filter @rjls/runtime auth:provision");
});

test("standalone MCP shutdown closes its PostgreSQL pool on normal and failed startup", async () => {
  const source = await readFile(new URL("./stdio-server.ts", import.meta.url), "utf8");
  assert.equal(source.match(/database\.close\(\)/g)?.length, 2);
});
