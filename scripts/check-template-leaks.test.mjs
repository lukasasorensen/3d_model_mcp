import assert from "node:assert/strict";
import test from "node:test";
import { runTemplateLeakCheck } from "./check-template-leaks.mjs";

test("fails closed when an included source file cannot be read", async () => {
  const reads = [];
  const errors = [];
  const exitCode = await runTemplateLeakCheck({
    cwd: "/workspace",
    listFiles: async () => ["src/unreadable.ts", "dist/generated.ts", ".omx/private.md"],
    readText: async (file) => {
      reads.push(file);
      const error = new Error("permission denied");
      error.code = "EACCES";
      throw error;
    },
    log: () => assert.fail("an unreadable source must not pass"),
    error: (message) => errors.push(message),
  });

  assert.equal(exitCode, 1);
  assert.deepEqual(reads, ["/workspace/src/unreadable.ts"]);
  assert.deepEqual(errors, [
    "Template identity check failed:\n- src/unreadable.ts: unable to read source file (EACCES)",
  ]);
});
