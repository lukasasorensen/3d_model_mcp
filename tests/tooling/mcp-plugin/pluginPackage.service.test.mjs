import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { unzipSync, strFromU8 } from "fflate";
import { buildPluginPackages } from "../../../tooling/mcp-plugin/pluginPackage.service.mjs";
import { pluginManifests } from "../../../tooling/mcp-plugin/pluginManifests.util.mjs";
const root = fileURLToPath(new URL("../../../", import.meta.url));

test("plugin archives contain only the intended files, correct public clients, and a reproducible version", async () => {
  const directory = await mkdtemp(join(tmpdir(), "the44-plugin-package-"));
  try {
    const output = join(directory, "release");
    const readiness = await buildPluginPackages(root, output);
    const archives = {};
    for (const client of ["codex", "claude"]) {
      const path = join(
        output,
        `theoryfoundry-cad-${client}-${readiness.version}.zip`,
      );
      archives[client] = await readFile(path);
      const files = unzipSync(archives[client]);
      const folder = client === "codex" ? ".codex-plugin" : ".claude-plugin";
      assert.deepEqual(
        Object.keys(files).sort(),
        [
          `${folder}/plugin.json`,
          ".mcp.json",
          "README.md",
          "assets/logo.svg",
          "skills/connect-theoryfoundry/SKILL.md",
        ].sort(),
      );
      const manifest = JSON.parse(strFromU8(files[`${folder}/plugin.json`]));
      assert.equal(manifest.version, readiness.version);
      assert.equal(manifest.author.name, "Lukas Sorensen");
      const server = JSON.parse(strFromU8(files[".mcp.json"])).mcpServers[
        "theoryfoundry-cad"
      ];
      assert.equal(server.url, "https://3dai.theoryfoundry.com/mcp");
      assert.equal(server.type, "http");
      assert.equal(server.command, undefined);
      assert.equal(
        server.oauth.clientId,
        client === "codex"
          ? "theoryfoundry-openai-plugin"
          : "theoryfoundry-claude-code",
      );
      assert.equal(server.oauth.clientSecret, undefined);
      if (client === "codex") {
        assert.equal(server.tool_timeout_sec, 120);
        assert.deepEqual(server.scopes, ["cad:tools", "offline_access"]);
        assert.equal(
          server.extensions["com.openai"].auth.client.tokenEndpointAuthMethod,
          "none",
        );
      } else assert.equal(server.oauth.scopes, "cad:tools offline_access");
    }
    await buildPluginPackages(root, output);
    for (const client of ["codex", "claude"])
      assert.deepEqual(
        await readFile(
          join(output, `theoryfoundry-cad-${client}-${readiness.version}.zip`),
        ),
        archives[client],
      );
    const metadata = JSON.parse(
      await readFile(
        join(root, "plugins/theoryfoundry/plugin.metadata.json"),
        "utf8",
      ),
    );
    const builderUrl = new URL(
      "../../../tooling/mcp-plugin/pluginPackage.service.mjs",
      import.meta.url,
    ).href;
    const code = `import { buildPluginPackages } from ${JSON.stringify(builderUrl)}; await buildPluginPackages(process.argv[1], process.argv[2]);`;
    for (const timezone of ["UTC", "America/Chicago"]) {
      const timezoneOutput = join(directory, timezone.replaceAll("/", "-"));
      const result = spawnSync(
        process.execPath,
        ["--input-type=module", "-e", code, root, timezoneOutput],
        {
          env: { ...process.env, TZ: timezone },
          encoding: "utf8",
        },
      );
      assert.equal(result.status, 0, result.stderr);
      for (const client of ["codex", "claude"])
        assert.deepEqual(
          await readFile(
            join(
              timezoneOutput,
              `theoryfoundry-cad-${client}-${readiness.version}.zip`,
            ),
          ),
          archives[client],
        );
    }
    const fixture = join(directory, "fixture");
    await mkdir(fixture);
    await cp(join(root, "plugins"), join(fixture, "plugins"), {
      recursive: true,
    });
    await writeFile(
      join(fixture, "package.json"),
      JSON.stringify({ version: metadata.version }),
    );
    const publicationFile = join(
      fixture,
      "plugins/theoryfoundry/publication.metadata.json",
    );
    await writeFile(publicationFile, "{}");
    await assert.rejects(
      buildPluginPackages(fixture, join(directory, "submission"), true),
      /Public submission is not ready/,
    );
    await writeFile(
      publicationFile,
      JSON.stringify({
        supportURL: "https://example.test/support",
        privacyPolicyURL: "https://example.test/privacy",
        termsOfServiceURL: "https://example.test/terms",
        demoRecordingURL: "https://example.test/recording",
      }),
    );
    const submission = await buildPluginPackages(
      fixture,
      join(directory, "submission"),
      true,
    );
    assert.deepEqual(submission.missingPublicationMetadata, []);
    assert.ok(submission.pending.includes("directory review and approval"));
    assert.throws(() =>
      pluginManifests(
        { ...metadata, origin: "http://example.com" },
        {},
        "codex",
      ),
    );
    assert.throws(() =>
      pluginManifests(metadata, { supportURL: "javascript:alert(1)" }, "codex"),
    );
    assert.throws(() =>
      pluginManifests(
        metadata,
        { demoRecordingURL: "http://localhost/recording" },
        "codex",
      ),
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

for (const client of ["codex", "claude"])
  test(`installed ${client} validates a fresh plugin without touching personal configuration`, async (t) => {
    if (spawnSync(client, ["--version"]).status !== 0) {
      t.skip(`${client} CLI is not installed`);
      return;
    }
    const directory = await mkdtemp(join(tmpdir(), `the44-${client}-plugin-`));
    try {
      const output = join(directory, "marketplace");
      await buildPluginPackages(root, output);
      const env = {
        ...process.env,
        CODEX_HOME: join(directory, "codex-home"),
        CLAUDE_CONFIG_DIR: join(directory, "claude-home"),
      };
      await mkdir(env.CODEX_HOME);
      await mkdir(env.CLAUDE_CONFIG_DIR);
      const run = (args) => {
        const result = spawnSync(client, args, {
          cwd: directory,
          env,
          encoding: "utf8",
          timeout: 30_000,
        });
        assert.equal(result.status, 0, result.stderr + result.stdout);
        return result.stdout;
      };
      if (client === "codex") {
        run(["plugin", "marketplace", "add", output, "--json"]);
        const installed = JSON.parse(
          run(["plugin", "add", "theoryfoundry-cad@theoryfoundry", "--json"]),
        );
        assert.equal(installed.name, "theoryfoundry-cad");
        const servers = JSON.parse(run(["mcp", "list", "--json"]));
        const server = servers.find(
          (value) => value.name === "theoryfoundry-cad",
        );
        assert.equal(
          server.transport.url,
          "https://3dai.theoryfoundry.com/mcp",
        );
        assert.equal(server.tool_timeout_sec, 120);
      } else {
        run(["plugin", "validate", "--strict", join(output, "claude")]);
        run(["plugin", "marketplace", "add", output]);
        run([
          "plugin",
          "install",
          "theoryfoundry-cad@theoryfoundry",
          "--scope",
          "user",
        ]);
        const installed = JSON.parse(run(["plugin", "list", "--json"]));
        assert.ok(
          installed.some(
            (value) => value.id === "theoryfoundry-cad@theoryfoundry",
          ),
        );
      }
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
