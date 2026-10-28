import assert from "node:assert/strict";
import test from "node:test";
import { createReadinessHandler } from "../../../../src/features/readiness/controllers/readiness.controller";

void test("readiness route returns 503 unless the renderer probe succeeds", async () => {
  const unavailable = createReadinessHandler(async () => {
    throw new Error("/private/toolchain detail");
  });
  const failedResponse = await unavailable();
  assert.equal(failedResponse.status, 503);
  assert.deepEqual(await failedResponse.json(), {
    readiness: {
      status: "unavailable",
      message: "The local CAD runtime is unavailable.",
    },
  });

  const ready = createReadinessHandler(async () => ({
    status: "ready" as const,
    profile: "browser-wasm" as const,
  }));
  const readyResponse = await ready();
  assert.equal(readyResponse.status, 200);
  assert.deepEqual(await readyResponse.json(), {
    readiness: { status: "ready", profile: "browser-wasm" },
  });
});
