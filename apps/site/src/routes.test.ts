import assert from "node:assert/strict";
import test from "node:test";
import { POST as restoreRevision } from "./app/v1/projects/[projectId]/revisions/[revisionId]/restore/route";
import { createReadinessHandler } from "./lib/readiness-route";

test("readiness route returns 503 unless the renderer probe succeeds", async () => {
  const unavailable = createReadinessHandler(async () => ({ probeReadiness: async () => { throw new Error("/private/toolchain detail"); } }));
  const failedResponse = await unavailable();
  assert.equal(failedResponse.status, 503);
  assert.deepEqual(await failedResponse.json(), { readiness: { status: "unavailable", message: "The local CAD runtime is unavailable." } });

  const ready = createReadinessHandler(async () => ({ probeReadiness: async () => ({ status: "ready" as const, profile: "browser-wasm" as const }) }));
  const readyResponse = await ready();
  assert.equal(readyResponse.status, 200);
  assert.deepEqual(await readyResponse.json(), { readiness: { status: "ready", profile: "browser-wasm" } });
});

test("restore route enforces exact same-origin requests", async () => {
  const response = await restoreRevision(new Request("http://localhost/v1", { method: "POST", headers: { origin: "https://attacker.invalid" } }), { params: Promise.resolve({ projectId: "demo-project", revisionId: "revision-1" }) });
  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), { error: { code: "ORIGIN_DENIED", message: "The request origin is not allowed." } });
});
