import assert from "node:assert/strict";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { mkdtemp, writeFile, mkdir, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { codexConnectCommand, codexStarterPrompt } from "./codex-connect-command";

test("copied commands execute with correct arguments and clean up even on download failure", async () => {
  const directory = await mkdtemp(join(tmpdir(), "cad command "));
  try {
    const bin = join(directory, "bin");
    await mkdir(bin);
    const trace = join(directory, "trace");
    await writeFile(join(bin, "curl"), '#!/bin/sh\n[ "$DOWNLOAD_FAIL" != 1 ] || exit 22\nwhile [ "$1" != "-o" ]; do shift; done\nprintf "%s" "// installer fixture" > "$2"\n', { mode: 0o700 });
    await writeFile(join(bin, "node"), '#!/bin/sh\nprintf "%s\\n" "$@" > "$TRACE"\n', { mode: 0o700 });
    for (const shell of ["/bin/sh", "/bin/bash", "/bin/zsh"]) {
      const command = codexConnectCommand("https://cad.example.com", "project");
      const result = spawnSync(shell, ["-c", command], { env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, TRACE: trace }, encoding: "utf8" });
      if (result.error && (result.error as NodeJS.ErrnoException).code === "ENOENT") continue;
      assert.equal(result.status, 0, result.stderr);
      const [script, origin, scope] = (await readFile(trace, "utf8")).trim().split("\n");
      assert.equal(origin, "https://cad.example.com");
      assert.equal(scope, "project");
      await assert.rejects(readFile(script), { code: "ENOENT" });
      const failed = spawnSync(shell, ["-c", command], { env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, DOWNLOAD_FAIL: "1", TRACE: trace } });
      assert.equal(failed.status, 22);
    }
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("commands reject noncanonical origins and starter prompts include the project", () => {
  for (const origin of ["https://example.com/$(touch /tmp/oops)", "http://example.com", "https://user@example.com"]) assert.throws(() => codexConnectCommand(origin, "global"));
  assert.match(codexConnectCommand("http://localhost:3000", "global"), /'global'/);
  assert.match(codexStarterPrompt("project-123"), /inspect project project-123/);
});
