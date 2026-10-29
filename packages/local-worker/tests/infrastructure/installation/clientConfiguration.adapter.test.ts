import test from "node:test";
import assert from "node:assert/strict";
import {
  mkdtemp,
  realpath,
  rm,
  readFile,
  writeFile,
  mkdir,
  symlink,
  lstat,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { parse } from "smol-toml";
import {
  configureClient,
  clientSettings,
  mergeClientConfiguration,
} from "../../../src/infrastructure/installation/index.js";
import type { ClientInstallation } from "../../../src/domains/installation/index.js";
const metadata = { name: "@theoryfoundry/local-worker", version: "0.1.0" };
const installation: ClientInstallation = {
  client: "codex",
  scope: "global",
  target: {
    server: "https://cad.example",
    account: "account",
    allowLoopbackHttp: false,
  },
};
const signal = (): AbortSignal => new AbortController().signal;
void test("Codex custom home preserves bytes, backs up once and rejects conflicting versions", async () => {
  const home = await realpath(await mkdtemp(join(tmpdir(), "worker-config-")));
  try {
    const custom = join(home, "custom");
    await mkdir(custom);
    const path = join(custom, "config.toml");
    const original =
      '# Keep this comment\nmodel = "unchanged"\n[mcp_servers.other]\ncommand = "other"\n';
    await writeFile(path, original);
    const options = {
      home,
      environment: { CODEX_HOME: custom },
      checkClient: false,
    };
    const first = await configureClient(
      installation,
      metadata,
      signal(),
      options,
    );
    assert.equal(first.path, path);
    assert.equal(first.changed, true);
    assert.ok(first.backup);
    assert.equal(await readFile(first.backup, "utf8"), original);
    const saved = await readFile(path, "utf8");
    assert.ok(saved.startsWith(original));
    assert.equal(
      (await configureClient(installation, metadata, signal(), options))
        .changed,
      false,
    );
    assert.throws(
      () =>
        mergeClientConfiguration(saved, installation, {
          ...metadata,
          version: "0.2.0",
        }),
      /Conflicting/,
    );
    assert.equal((await lstat(path)).mode & 0o777, 0o600);
    const config = parse(saved);
    assert.equal(config.model, "unchanged");
    assert.ok(config.mcp_servers);
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});
void test("Claude user/project config preserves unrelated settings and contains only stdio account identifiers", async () => {
  const home = await realpath(await mkdtemp(join(tmpdir(), "worker-config-")));
  try {
    const cwd = join(home, "project");
    await mkdir(cwd);
    execFileSync("git", ["init", "--quiet", cwd]);
    for (const scope of ["global", "project"] as const) {
      const item = { ...installation, client: "claude" as const, scope };
      const path =
        scope === "global"
          ? join(home, ".claude.json")
          : join(cwd, ".mcp.json");
      const original = {
        unrelated: { nested: true },
        mcpServers: { other: { command: "other" } },
      };
      await writeFile(path, JSON.stringify(original));
      const receipt = await configureClient(item, metadata, signal(), {
        home,
        cwd,
        environment: {},
        checkClient: false,
      });
      assert.equal(receipt.path, path);
      const saved = JSON.parse(
        await readFile(path, "utf8"),
      ) as typeof original & { mcpServers: Record<string, unknown> };
      assert.deepEqual(saved.unrelated, original.unrelated);
      assert.deepEqual(saved.mcpServers.other, original.mcpServers.other);
      const settings = clientSettings(item, metadata);
      assert.deepEqual(saved.mcpServers[settings.name], settings.server);
      assert.doesNotMatch(
        JSON.stringify(settings),
        /refreshToken|Authorization|NPM_TOKEN/,
      );
    }
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});
void test("setup refuses symlink files/parents and invalid config without overwriting targets", async () => {
  const home = await realpath(await mkdtemp(join(tmpdir(), "worker-config-")));
  try {
    const target = join(home, "target");
    await writeFile(target, "untouched");
    const path = join(home, ".claude.json");
    await symlink(target, path);
    await assert.rejects(
      configureClient(
        { ...installation, client: "claude" },
        metadata,
        signal(),
        { home, environment: {}, checkClient: false },
      ),
      /symlink/,
    );
    assert.equal(await readFile(target, "utf8"), "untouched");
    await symlink(home, join(home, "linked"));
    await assert.rejects(
      configureClient(installation, metadata, signal(), {
        home,
        environment: { CODEX_HOME: join(home, "linked") },
        checkClient: false,
      }),
      /symlink/,
    );
    assert.throws(
      () =>
        mergeClientConfiguration(
          "not valid json",
          { ...installation, client: "claude" },
          metadata,
        ),
      /parsed/,
    );
    assert.throws(
      () =>
        mergeClientConfiguration(
          '{"mcpServers":[]}',
          { ...installation, client: "claude" },
          metadata,
        ),
      /objects/,
    );
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});
