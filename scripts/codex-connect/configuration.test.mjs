import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parse } from "smol-toml";
import { connectionSettings, installConfiguration, mergeConfiguration } from "./configuration.mjs";

const settings = connectionSettings("https://cad.example.com");
test("append preserves existing comments, multiline strings, and other server policies", () => {
  const original = '# User preferences\nmodel = "example" # retained\nnotes = """\n[mcp_servers.fake]\n"""\n[mcp_servers.other]\ncommand = "node"\nargs = ["a b.mjs"]\n';
  const merged = mergeConfiguration(original, settings);
  assert.ok(merged.startsWith(original));
  assert.deepEqual(JSON.parse(JSON.stringify(parse(merged).mcp_servers[settings.name])), settings.server);
  assert.equal(mergeConfiguration(merged, settings), merged);
});

test("invalid TOML and conflicting server settings are never replaced", () => {
  assert.throws(() => mergeConfiguration('model = "unterminated', settings));
  assert.throws(() => mergeConfiguration("mcp_servers = 3", settings));
  const merged = mergeConfiguration("", settings);
  for (const changed of [merged.replace("120", "30"), merged.replace("/mcp", "/other"), merged + "\nextra = true\n"]) {
    assert.throws(() => mergeConfiguration(changed, settings), /Conflicting/);
  }
  assert.throws(() => mergeConfiguration('mcp_servers = { other = { url = "https://example.com" } }', settings));
});

test("origins are canonical, validated, and have stable distinct server names", () => {
  for (const origin of ["http://example.com", "https://user:pass@example.com", "https://example.com/path", "https://example.com/", "file:///tmp/test"]) {
    assert.throws(() => connectionSettings(origin));
  }
  assert.equal(connectionSettings("https://cad.example.com").name, settings.name);
  assert.notEqual(connectionSettings("https://other.example.com").name, settings.name);
  assert.equal(connectionSettings("http://localhost:3000").server.url, "http://localhost:3000/mcp");
});

test("file installation backs up exactly, is idempotent, and rejects symlinks", async () => {
  const directory = await mkdtemp(join(tmpdir(), "cad config test "));
  try {
    const path = join(directory, "config.toml");
    const original = '# Keep me\nmodel = "example"\n';
    await writeFile(path, original);
    const result = await installConfiguration(path, settings);
    assert.equal(await readFile(result.backup, "utf8"), original);
    assert.equal((await installConfiguration(path, settings)).changed, false);
    assert.equal((await readdir(directory)).length, 2);
    const link = join(directory, "link.toml");
    await symlink(path, link);
    await assert.rejects(installConfiguration(link, settings), /symlink/);
    await writeFile(path, "bad = [");
    await assert.rejects(installConfiguration(path, settings));
    assert.equal(await readFile(path, "utf8"), "bad = [");
    assert.ok(!(await readdir(directory)).some(name => name.endsWith(".lock") || name.endsWith(".tmp")));
  } finally { await rm(directory, { recursive: true, force: true }); }
});
