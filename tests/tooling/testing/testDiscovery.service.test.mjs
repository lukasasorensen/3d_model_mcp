import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import {
  discoverTests,
  groupTests,
  runTestGroups,
} from "../../../tooling/testing/testDiscovery.service.mjs";

test("discovers nested source and mirrored tests without build output or symlinks", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "test-discovery-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const expected = [
    "scripts/leaks.test.mjs",
    "tests/tooling/a.service.test.mjs",
    "apps/site/tests/features/deep/a.component.test.tsx",
    "packages/runtime/src/worker/a.service.test.mjs",
    "packages/runtime/model-project/tests/domains/a.service.test.ts",
  ].sort();
  for (const file of [
    ...expected,
    "node_modules/a.test.js",
    "apps/site/.next-acceptance/a.test.js",
    "packages/runtime/dist/a.test.js",
    "apps/site/public/vendor/a.test.js",
  ]) {
    await mkdir(dirname(join(root, file)), { recursive: true });
    await writeFile(join(root, file), "");
  }
  assert.deepEqual(await discoverTests(root), expected);
  const projects = [
    "",
    "apps/site",
    "packages/runtime",
    "packages/runtime/model-project",
  ].map((path) => ({ path: join(root, path), name: path || "root" }));
  const groups = groupTests(root, expected, projects);
  assert.equal(
    groups.reduce((count, group) => count + group.files.length, 0),
    expected.length,
  );
  assert.deepEqual(
    groups.find((group) => group.name === "packages/runtime").files,
    ["src/worker/a.service.test.mjs"],
  );
  assert.deepEqual(
    groups.find((group) => group.name === "packages/runtime/model-project")
      .files,
    ["tests/domains/a.service.test.ts"],
  );
});

test("runs from each owner's directory and uses tsx only for TypeScript groups", () => {
  const calls = [];
  const groups = [
    { path: "/workspace", files: ["tests/a.service.test.mjs"] },
    { path: "/workspace/apps/site", files: ["tests/a.component.test.tsx"] },
  ];
  assert.equal(
    runTestGroups(groups, (...args) => {
      calls.push(args);
      return { status: 0 };
    }),
    0,
  );
  assert.deepEqual(
    calls.map((call) => call[2].cwd),
    groups.map((group) => group.path),
  );
  assert.deepEqual(calls[0][1], ["--test", "tests/a.service.test.mjs"]);
  assert.deepEqual(calls[1][1], [
    "--import",
    "tsx",
    "--test",
    "tests/a.component.test.tsx",
  ]);
});

test("propagates nonzero exits, signals and spawn failures", () => {
  const groups = [
    { path: "/workspace", files: ["a.test.mjs"] },
    { path: "/workspace/next", files: ["b.test.mjs"] },
  ];
  let calls = 0;
  assert.equal(
    runTestGroups(groups, () => {
      calls++;
      return { status: 7 };
    }),
    7,
  );
  assert.equal(calls, 1);
  assert.equal(
    runTestGroups(groups, () => ({ status: null, signal: "SIGTERM" })),
    1,
  );
  assert.throws(
    () => runTestGroups(groups, () => ({ error: new Error("spawn failed") })),
    /spawn failed/,
  );
  assert.throws(
    () => groupTests("/workspace", ["a.test.mjs"], []),
    /no workspace owner/,
  );
});
