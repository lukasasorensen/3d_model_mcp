import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { cp, mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  baselinePath,
  bootstrapCommit,
  inspectSource,
} from "../../../tooling/conventions/sourceConventions.policy.mjs";

test("CLI uses committed base state, rejects new exemptions and fails closed without history", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "conventions-cli-"));
  const repository = fileURLToPath(new URL("../../../", import.meta.url));
  context.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, "tooling"));
  await cp(
    join(repository, "tooling/conventions"),
    join(root, "tooling/conventions"),
    { recursive: true },
  );
  await cp(
    join(repository, "prettier.config.mjs"),
    join(root, "prettier.config.mjs"),
  );
  await symlink(
    join(repository, "node_modules"),
    join(root, "node_modules"),
    "dir",
  );
  await writeFile(join(root, ".gitignore"), "node_modules\n");
  const source = "export const x=1";
  const record = await inspectSource("example.util.ts", source);
  const baseline = {
    version: 1,
    sourceCommit: bootstrapCommit,
    files: { "example.util.ts": record },
  };
  const save = () =>
    writeFile(join(root, baselinePath), JSON.stringify(baseline));
  await save();
  await writeFile(join(root, "example.util.ts"), source);
  const git = (...args) =>
    execFileSync("git", args, { cwd: root, stdio: "pipe" });
  git("init", "--quiet");
  git("add", ".");
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
  const run = (ref = "HEAD") =>
    spawnSync(
      process.execPath,
      ["tooling/conventions/checkConventions.script.mjs"],
      {
        cwd: root,
        encoding: "utf8",
        env: { ...process.env, ALIGNMENT_BASE_REF: ref },
      },
    );
  {
    const result = run();
    assert.equal(result.status, 0, result.stderr);
  }
  baseline.files["newExample.util.ts"] = record;
  await writeFile(join(root, "newExample.util.ts"), source);
  await save();
  assert.match(run().stderr, /newExample.util.ts: format exemption added/);
  delete baseline.files["newExample.util.ts"];
  await rm(join(root, "newExample.util.ts"));
  await save();
  await writeFile(join(root, "example.util.ts"), "export const x=2");
  assert.match(run().stderr, /example.util.ts: formatting differs/);
  await writeFile(join(root, "example.util.ts"), "export const x = 1;\n");
  assert.match(run().stderr, /stale formatHash/);
  delete baseline.files["example.util.ts"];
  await save();
  {
    const result = run();
    assert.equal(result.status, 0, result.stderr);
  }
  assert.notEqual(run("missing-revision").status, 0);
  git("rm", "--force", baselinePath);
  git(
    "-c",
    "user.name=Test",
    "-c",
    "user.email=test@example.invalid",
    "commit",
    "--quiet",
    "-m",
    "missing baseline",
  );
  await save();
  assert.match(run().stderr, /Baseline bootstrap requires/);
});
