import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { parse } from "smol-toml";
import { connectionSettings } from "../../../tooling/codex-connect/configuration.adapter.mjs";
import { oauthArguments } from "../../../tooling/codex-connect/installer.service.mjs";

const root = fileURLToPath(new URL("../../../", import.meta.url));

test(
  "packed installer runs through offline npx outside the checkout with isolated configuration",
  { timeout: 60_000 },
  async () => {
    const directory = await realpath(await mkdtemp(join(tmpdir(), "cad npx ")));
    try {
      execFileSync(
        process.execPath,
        [join(root, "tooling/codex-connect/buildPackage.script.mjs")],
        { cwd: directory },
      );
      const cache = join(directory, "npm-cache");
      const userconfig = join(directory, "npmrc");
      await writeFile(userconfig, "");
      const environment = {
        ...process.env,
        npm_config_cache: cache,
        npm_config_userconfig: userconfig,
        npm_config_registry: "http://127.0.0.1:1",
        CODEX_HOME: join(directory, "codex-home"),
        TRACE: join(directory, "trace.jsonl"),
      };
      const [packed] = JSON.parse(
        execFileSync(
          "npm",
          [
            "pack",
            "--json",
            "--offline",
            "--ignore-scripts",
            "--pack-destination",
            directory,
          ],
          {
            cwd: join(root, "dist/codex-connect-package"),
            env: environment,
            encoding: "utf8",
          },
        ),
      );
      assert.equal(packed.name, "@tfoundry/connect-codex");
      assert.deepEqual(packed.files.map((file) => file.path).sort(), [
        "README.md",
        "connect-codex.mjs",
        "package.json",
      ]);
      const bundle = await readFile(
        join(root, "dist/codex-connect-package/connect-codex.mjs"),
        "utf8",
      );
      assert.ok(bundle.startsWith("#!/usr/bin/env node\n"));
      assert.match(bundle, /SPDX-License-Identifier: BSD-3-Clause/);
      const bin = join(directory, "bin");
      await mkdir(bin);
      await writeFile(
        join(bin, "codex"),
        `#!/usr/bin/env node
const { appendFileSync } = require("node:fs");
const args = process.argv.slice(2);
appendFileSync(process.env.TRACE, JSON.stringify(args) + "\\n");
if (args[0] === "--version") console.log("codex fixture");
else process.exitCode = process.env.LOGIN_FAIL === "1" ? 1 : 0;
`,
        { mode: 0o755 },
      );
      environment.PATH = `${bin}:${process.env.PATH}`;
      const tarball = join(directory, packed.filename);
      const run = (args, cwd = directory, extra = {}) =>
        spawnSync(
          "npx",
          [
            "--offline",
            "--yes",
            `--package=${tarball}`,
            "connect-codex",
            ...args,
          ],
          {
            cwd,
            env: { ...environment, ...extra },
            encoding: "utf8",
            timeout: 15_000,
          },
        );
      const help = run(["--help"]);
      assert.equal(help.status, 0, help.stderr);
      assert.match(help.stdout, /Usage: connect-codex/);
      await assert.rejects(readFile(environment.TRACE), { code: "ENOENT" });
      assert.equal(run(["http://untrusted.example", "global"]).status, 1);
      await assert.rejects(
        readFile(join(environment.CODEX_HOME, "config.toml")),
        { code: "ENOENT" },
      );

      const origin = "https://cad.example.com";
      const settings = connectionSettings(origin);
      const globalPath = join(environment.CODEX_HOME, "config.toml");
      const original = '# Preferences stay intact\nmodel = "example"\n';
      await mkdir(environment.CODEX_HOME);
      await writeFile(globalPath, original);
      const failed = run([origin, "global"], directory, { LOGIN_FAIL: "1" });
      assert.equal(failed.status, 1, failed.stderr);
      assert.match(failed.stdout, /authorization did not finish/);
      assert.match(failed.stdout, /'codex' 'mcp' 'login'/);
      const config = await readFile(globalPath, "utf8");
      assert.ok(config.startsWith(original));
      assert.deepEqual(
        JSON.parse(JSON.stringify(parse(config).mcp_servers[settings.name])),
        settings.server,
      );
      const [backup] = (await readdir(environment.CODEX_HOME)).filter((file) =>
        file.includes(".cad-backup-"),
      );
      assert.ok(backup);
      assert.equal(
        await readFile(join(environment.CODEX_HOME, backup), "utf8"),
        original,
      );
      const retry = run([origin, "global"]);
      assert.equal(retry.status, 0, retry.stderr);
      assert.match(retry.stdout, /already installed/);
      assert.equal(await readFile(globalPath, "utf8"), config);

      const repo = join(directory, "repository");
      execFileSync("git", ["init", repo], { stdio: "pipe" });
      const project = run([origin, "project"], repo);
      assert.equal(project.status, 0, project.stderr);
      assert.match(project.stdout, /Trust this repository/);
      assert.deepEqual(
        parse(await readFile(join(repo, ".codex/config.toml"), "utf8"))
          .mcp_servers,
        parse(config).mcp_servers,
      );
      assert.equal(await readFile(globalPath, "utf8"), config);
      const calls = (await readFile(environment.TRACE, "utf8"))
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line));
      assert.deepEqual(
        calls.filter((args) => args[0] === "mcp"),
        Array.from({ length: 3 }, () => oauthArguments(settings)),
      );
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  },
);
