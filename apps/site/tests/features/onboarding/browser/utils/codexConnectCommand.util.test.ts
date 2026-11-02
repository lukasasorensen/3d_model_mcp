import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  codexConnectCommand,
  codexStarterPrompt,
} from "../../../../../src/features/onboarding/browser/utils/codexConnectCommand.util";

void test("copied npx commands execute the pinned installer with the selected scope", async () => {
  const directory = await mkdtemp(join(tmpdir(), "cad command "));
  try {
    const bin = join(directory, "bin");
    await mkdir(bin);
    const trace = join(directory, "trace");
    await writeFile(
      join(bin, "npx"),
      '#!/bin/sh\nprintf "%s\\n" "$@" > "$TRACE"\n',
      { mode: 0o700 },
    );
    const metadata = JSON.parse(
      await readFile(
        fileURLToPath(
          new URL(
            "../../../../../../../tooling/codex-connect/package.metadata.json",
            import.meta.url,
          ),
        ),
        "utf8",
      ),
    ) as { name: string; version: string };
    for (const shell of ["/bin/sh", "/bin/bash", "/bin/zsh"]) {
      for (const scope of ["global", "project"] as const) {
        const command = codexConnectCommand("https://cad.example.com", scope);
        const result = spawnSync(shell, ["-c", command], {
          env: {
            ...process.env,
            PATH: `${bin}:${process.env.PATH}`,
            TRACE: trace,
          },
          encoding: "utf8",
        });
        if (
          result.error &&
          (result.error as NodeJS.ErrnoException).code === "ENOENT"
        )
          continue;
        assert.equal(result.status, 0, result.stderr);
        const args = (await readFile(trace, "utf8")).trim().split("\n");
        assert.deepEqual(args, [
          "--yes",
          `${metadata.name}@${metadata.version}`,
          "https://cad.example.com",
          scope,
        ]);
      }
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

void test("commands reject noncanonical origins and starter prompts include the project", () => {
  for (const origin of [
    "https://example.com/$(touch /tmp/oops)",
    "http://example.com",
    "https://user@example.com",
  ])
    assert.throws(() => codexConnectCommand(origin, "global"));
  assert.match(
    codexConnectCommand("http://localhost:3000", "global"),
    /'global'/,
  );
  assert.match(
    codexStarterPrompt("project-123"),
    /inspect project project-123/,
  );
});
