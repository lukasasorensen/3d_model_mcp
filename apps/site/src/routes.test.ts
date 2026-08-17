import assert from "node:assert/strict";
import test from "node:test";
import { GET as getArtifact } from "./app/v1/projects/[projectId]/revisions/[revisionId]/artifacts/[artifactId]/route";
import { createArtifactGetHandler } from "./lib/artifact-route";
import { POST as restoreRevision } from "./app/v1/projects/[projectId]/revisions/[revisionId]/restore/route";
import { createReadinessHandler } from "./lib/readiness-route";

test("artifact route rejects traversal and double-encoded opaque IDs before runtime access", async () => {
  for (const artifactId of ["..%2Fsecret", "%252e%252e%252fsecret", "/tmp/model.stl"]) {
    const response = await getArtifact(new Request("http://localhost"), { params: Promise.resolve({ projectId: "demo-project", revisionId: "revision-1", artifactId }) });
    assert.equal(response.status, 400);
    assert.doesNotMatch(await response.text(), /Users|private|tmp|\.rjls-projects/);
  }
});

test("artifact route rejects historical 3MF and serves authoritative current 3MF", async () => {
  const bytes = new TextEncoder().encode("current-3mf");
  const manifest = { artifactId: "artifact-current", format: "3mf", mimeType: "model/3mf", byteSize: bytes.byteLength, hash: "a".repeat(64), sourceRevision: "revision-current" };
  const handler = createArtifactGetHandler(async () => ({ repository: {
    async readArtifact(_projectId: string, revision: string) {
      if (revision !== "revision-current") throw new Error("STALE_REVISION");
      return { manifest, bytes };
    },
  } as never }));
  const historical = await handler(new Request("http://localhost"), { params: Promise.resolve({ projectId: "demo-project", revisionId: "revision-old", artifactId: "artifact-old" }) });
  assert.equal(historical.status, 404);
  const current = await handler(new Request("http://localhost"), { params: Promise.resolve({ projectId: "demo-project", revisionId: "revision-current", artifactId: "artifact-current" }) });
  assert.equal(current.status, 200);
  assert.equal(current.headers.get("content-type"), "model/3mf");
  assert.equal(current.headers.get("x-rjls-artifact-revision"), "revision-current");
  assert.equal(await current.text(), "current-3mf");
});

test("readiness route returns 503 unless the renderer probe succeeds", async () => {
  const unavailable = createReadinessHandler(async () => ({ probeReadiness: async () => { throw new Error("/private/toolchain detail"); } }));
  const failedResponse = await unavailable();
  assert.equal(failedResponse.status, 503);
  assert.deepEqual(await failedResponse.json(), { readiness: { status: "unavailable", message: "The renderer toolchain is unavailable." } });

  const ready = createReadinessHandler(async () => ({ probeReadiness: async () => ({ status: "ready" as const, profile: "production-oci" as const }) }));
  const readyResponse = await ready();
  assert.equal(readyResponse.status, 200);
  assert.deepEqual(await readyResponse.json(), { readiness: { status: "ready", profile: "production-oci" } });
});

test("restore route enforces exact same-origin requests", async () => {
  const response = await restoreRevision(new Request("http://localhost/v1", { method: "POST", headers: { origin: "https://attacker.invalid" } }), { params: Promise.resolve({ projectId: "demo-project", revisionId: "revision-1" }) });
  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), { error: { code: "ORIGIN_DENIED", message: "The request origin is not allowed." } });
});
