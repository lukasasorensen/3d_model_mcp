import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { readPreviousArchitectureBaseline } from "../../../tooling/architecture/baseSnapshot.repository.mjs";
import { architectureBaselinePath } from "../../../tooling/architecture/architectureBaseline.policy.mjs";

test(
  "baseline comparison reads committed content and rejects missing history or unauthorized bootstrap",
  {
    skip:
      spawnSync("git", ["--version"]).error?.code === "ENOENT"
        ? "Git CLI unavailable; checkout CI exercises snapshot verification"
        : false,
  },
  async (context) => {
    const root = await mkdtemp(path.join(tmpdir(), "architecture-ratchet-"));
    context.after(() => rm(root, { recursive: true, force: true }));
    const baseline = {
      version: 1,
      sourceCommit: "a".repeat(40),
      violations: [],
    };
    const file = path.join(root, architectureBaselinePath);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, JSON.stringify(baseline));
    const git = (...args) =>
      execFileSync("git", args, { cwd: root, stdio: "pipe" });
    const commit = () =>
      git(
        "-c",
        "user.name=Test",
        "-c",
        "user.email=test@example.invalid",
        "commit",
        "--quiet",
        "-m",
        "fixture",
      );
    git("init", "--quiet");
    git("add", ".");
    commit();
    await writeFile(file, "not the committed baseline");
    assert.deepEqual(
      await readPreviousArchitectureBaseline(root, "HEAD"),
      baseline,
    );
    await assert.rejects(readPreviousArchitectureBaseline(root, "missing-ref"));
    git("rm", "-f", architectureBaselinePath);
    commit();
    await assert.rejects(
      readPreviousArchitectureBaseline(root, "HEAD"),
      /bootstrap requires/,
    );
  },
);
