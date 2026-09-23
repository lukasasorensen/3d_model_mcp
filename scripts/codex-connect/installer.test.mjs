import assert from "node:assert/strict";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { connectionSettings, installConfiguration } from "./configuration.mjs";
import { configurationPath, oauthArguments, runInstaller } from "./installer.mjs";

const origin = "https://cad.example.com";
test("scope selects custom Codex home or repository without confusing the two", () => {
  assert.equal(configurationPath("global", "/repo", {}, "/home/user"), "/home/user/.codex/config.toml");
  assert.equal(configurationPath("global", "/repo", { CODEX_HOME: "/custom home" }, "/home/user"), "/custom home/config.toml");
  assert.equal(configurationPath("project", "/repo", { CODEX_HOME: "/custom" }, "/home/user"), "/repo/.codex/config.toml");
  assert.throws(() => configurationPath("unknown", "/repo", {}, "/home"));
  assert.throws(() => configurationPath("global", "/repo", { CODEX_HOME: "relative" }, "/home"));
});

test("missing CLI or wrong repository directory does not write config", async () => {
  const directory = await mkdtemp(join(tmpdir(), "cad installer "));
  try {
    await assert.rejects(runInstaller([origin, "global"], { home: directory, run: () => ({ status: 1 }) }), /Codex CLI/);
    await assert.rejects(readFile(join(directory, ".codex/config.toml")), { code: "ENOENT" });
    await assert.rejects(runInstaller([origin, "project"], { cwd: directory, run: (cmd) => ({ status: 0, stdout: cmd === "git" ? "/another\n" : "codex" }) }), /root/);
    await assert.rejects(readFile(join(directory, ".codex/config.toml")), { code: "ENOENT" });
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("failed login keeps configuration, prints exact retry, and a rerun can authorize", async () => {
  const directory = await mkdtemp(join(tmpdir(), "cad installer "));
  const lines = [];
  let loginStatus = 1;
  const options = { cwd: directory, environment: { ...process.env, CODEX_HOME: directory }, log: line => lines.push(line),
    run: (command, args) => {
      assert.equal(command, "codex");
      if (args[0] === "--version") return { status: 0 };
      assert.deepEqual(args, oauthArguments(connectionSettings(origin)));
      return { status: loginStatus };
    } };
  try {
    await assert.rejects(runInstaller([origin, "global"], options), /Authorization incomplete/);
    assert.match(await readFile(join(directory, "config.toml"), "utf8"), /tool_timeout_sec = 120/);
    assert.ok(lines.some(line => line.includes("'codex' 'mcp' 'login'")));
    loginStatus = 0;
    await runInstaller([origin, "global"], options);
    assert.ok(lines.some(line => line.includes("already installed")));
    assert.ok(lines.some(line => line.includes("Authorization completed")));
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("installed Codex reads both scopes in isolated homes", async (t) => {
  if (spawnSync("codex", ["--version"]).status !== 0) { t.skip("Codex CLI is not installed"); return; }
  const directory = await realpath(await mkdtemp(join(tmpdir(), "cad cli ")));
  const settings = connectionSettings(origin);
  try {
    for (const scope of ["global", "project"]) {
      const home = join(directory, scope, "home");
      const repo = join(directory, scope, "repo");
      await mkdir(home, { recursive: true });
      await mkdir(repo, { recursive: true });
      assert.equal(spawnSync("git", ["init", repo]).status, 0);
      if (scope === "project") await writeFile(join(home, "config.toml"), `[projects.${JSON.stringify(repo)}]\ntrust_level = "trusted"\n`);
      const environment = { ...process.env, CODEX_HOME: home };
      await installConfiguration(configurationPath(scope, repo, environment, directory), settings);
      const result = spawnSync("codex", ["mcp", "get", settings.name, "--json"], { cwd: repo, env: environment, encoding: "utf8" });
      assert.equal(result.status, 0, result.stderr);
      const server = JSON.parse(result.stdout);
      assert.equal(server.transport.url, settings.server.url);
      assert.equal(server.tool_timeout_sec, 120);
      // `mcp get --json` intentionally omits OAuth settings; those are checked
      // by the configuration and login-argument tests above.
    }
  } finally { await rm(directory, { recursive: true, force: true }); }
});
