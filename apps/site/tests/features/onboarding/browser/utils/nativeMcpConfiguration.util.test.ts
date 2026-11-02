import assert from "node:assert/strict";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { parse } from "smol-toml";
import {
  nativeClaudeCommand,
  nativeMcpConfiguration,
} from "../../../../../src/features/onboarding/browser/utils/nativeMcpConfiguration.util";
void test("manual fallback preserves the deployment, scopes and explicit public client identities", () => {
  const origin = "https://3dai.theoryfoundry.com";
  const codex = parse(nativeMcpConfiguration(origin, "codex")) as {
    mcp_servers: Record<string, { url: string; tool_timeout_sec: number }>;
  };
  const server = codex.mcp_servers["theoryfoundry-cad"];
  assert.ok(server);
  assert.equal(server.url, `${origin}/mcp`);
  assert.equal(server.tool_timeout_sec, 120);
  const claude = JSON.parse(nativeMcpConfiguration(origin, "claude")) as {
    mcpServers: Record<string, { url: string; oauth: { clientId: string } }>;
  };
  assert.equal(
    claude.mcpServers["theoryfoundry-cad"]?.oauth.clientId,
    "theoryfoundry-claude-code",
  );
  assert.equal(claude.mcpServers["theoryfoundry-cad"]?.url, `${origin}/mcp`);
  const command = nativeClaudeCommand(origin).replace(
    /^claude /,
    'printf "%s\\n" ',
  );
  const result = spawnSync("/bin/sh", ["-c", command], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  const args = result.stdout.trim().split("\n");
  assert.deepEqual(args.slice(0, 5), [
    "mcp",
    "add-json",
    "--scope",
    "user",
    "theoryfoundry-cad",
  ]);
  assert.deepEqual(
    JSON.parse(args[5] ?? ""),
    claude.mcpServers["theoryfoundry-cad"],
  );
  assert.throws(() =>
    nativeMcpConfiguration("https://example.com/path", "codex"),
  );
  assert.throws(() =>
    nativeMcpConfiguration("https://example.com", "other" as "codex"),
  );
});
