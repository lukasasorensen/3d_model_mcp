import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { unzipSync, strFromU8 } from "fflate";
import { buildPluginPackages } from "../../../tooling/mcp-plugin/pluginPackage.service.mjs";
import { pluginManifests } from "../../../tooling/mcp-plugin/pluginManifests.util.mjs";
const root = fileURLToPath(new URL("../../../", import.meta.url));
const pluginId = "theoryfoundry-cad@theoryfoundry";
const skillNames = [
  "connect-theoryfoundry",
  "create-model",
  "create-model-from-drawing",
  "fix-model",
  "plan-model",
];

function readSkillFrontmatter(content) {
  const [before, frontmatter, instructions] = content.split("---\n", 3);
  assert.equal(before, "");
  assert.ok(
    instructions?.trim(),
    "Expected skill instructions after frontmatter",
  );
  const fields = frontmatter.split("\n");
  return {
    name: fields.find((line) => line.startsWith("name: "))?.slice(6),
    description: fields
      .find((line) => line.startsWith("description: "))
      ?.slice(13),
  };
}

async function listCodexSkills(cwd, env) {
  const server = spawn("codex", ["app-server", "--listen", "stdio://"], {
    cwd,
    env,
    stdio: ["pipe", "pipe", "ignore"],
  });
  const closed = once(server, "close");
  const lines = createInterface({ input: server.stdout });
  const timer = setTimeout(() => server.kill(), 15_000);
  const send = (request) => server.stdin.write(JSON.stringify(request) + "\n");

  try {
    send({
      id: 1,
      method: "initialize",
      params: { clientInfo: { name: "plugin-package-test", version: "1.0.0" } },
    });
    for await (const line of lines) {
      const response = JSON.parse(line);
      if (response.id === 1) {
        assert.ok(response.result, line);
        send({ method: "initialized" });
        send({ id: 2, method: "skills/list", params: { cwds: [cwd] } });
      }
      if (response.id === 2) {
        assert.ok(response.result, line);
        return response.result.data.flatMap((entry) => entry.skills);
      }
    }
    assert.fail("Codex app-server closed or timed out before listing skills");
  } finally {
    clearTimeout(timer);
    lines.close();
    server.kill();
    await closed;
  }
}

function readClaudeSkillInventory(details) {
  const inventory = details
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line.startsWith("Skills ("));
  assert.ok(inventory, details);
  return inventory
    .slice(inventory.indexOf(")") + 1)
    .trim()
    .split(", ");
}

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
          ...skillNames.map((name) => `skills/${name}/SKILL.md`),
        ].sort(),
      );
      const descriptions = new Set();
      for (const name of skillNames) {
        const content = strFromU8(files[`skills/${name}/SKILL.md`]);
        const frontmatter = readSkillFrontmatter(content);
        assert.equal(frontmatter.name, name);
        assert.ok(
          frontmatter.description?.trim(),
          `${name} needs a description`,
        );
        descriptions.add(frontmatter.description);
      }
      assert.equal(descriptions.size, skillNames.length);
      const manifest = JSON.parse(strFromU8(files[`${folder}/plugin.json`]));
      assert.equal(manifest.version, readiness.version);
      assert.equal(manifest.author.name, "Lukas Sorensen");
      assert.equal(manifest.skills, "./skills/");
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
  test(`installed ${client} discovers the hosted plugin's skills in a fresh profile`, async (t) => {
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
          run(["plugin", "add", pluginId, "--json"]),
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
        const skills = await listCodexSkills(directory, env);
        assert.deepEqual(
          skills
            .filter((skill) => skill.pluginId === pluginId && skill.enabled)
            .map((skill) => skill.name)
            .sort(),
          skillNames.map((name) => `theoryfoundry-cad:${name}`).sort(),
        );
      } else {
        run(["plugin", "validate", "--strict", join(output, "claude")]);
        run(["plugin", "marketplace", "add", output]);
        run(["plugin", "install", pluginId, "--scope", "user"]);
        const installed = JSON.parse(run(["plugin", "list", "--json"]));
        assert.ok(installed.some((value) => value.id === pluginId));
        const inventory = run(["plugin", "details", "theoryfoundry-cad"]);
        assert.deepEqual(
          readClaudeSkillInventory(inventory).sort(),
          skillNames,
        );
      }
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
