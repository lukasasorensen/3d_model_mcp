import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, rm, writeFile, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { localWorkerCommand } from "../../../../../src/features/onboarding/browser/utils/localWorkerCommand.util";
void test("public worker onboarding executes pinned setup with exact client/scope and no npm credentials", async () => {
  const directory = await mkdtemp(join(tmpdir(), "worker-command-"));
  try {
    const trace = join(directory, "trace");
    await writeFile(
      join(directory, "pnpm"),
      '#!/bin/sh\nprintf "%s\\n" "$@" > "$TRACE"\n',
      { mode: 0o700 },
    );
    for (const client of ["codex", "claude"] as const) {
      const result = spawnSync(
        "/bin/sh",
        ["-c", localWorkerCommand("http://localhost:3000", client, "project")],
        {
          env: {
            ...process.env,
            PATH: `${directory}:${process.env.PATH}`,
            TRACE: trace,
          },
        },
      );
      assert.equal(result.status, 0);
      assert.deepEqual((await readFile(trace, "utf8")).trim().split("\n"), [
        "--silent",
        "dlx",
        "@tfoundry/local-worker@0.1.0",
        "setup",
        "--server",
        "http://localhost:3000",
        "--client",
        client,
        "--scope",
        "project",
        "--allow-loopback-http",
      ]);
    }
    assert.throws(() =>
      localWorkerCommand("https://example.com/$(whoami)", "codex", "global"),
    );
    assert.throws(() =>
      localWorkerCommand("http://example.com", "codex", "global"),
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
