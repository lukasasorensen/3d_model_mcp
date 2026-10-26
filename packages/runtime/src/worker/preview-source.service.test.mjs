import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { CAD_LIMITS, acceptsWorkerRenderer, workerPreviewSourceInputSchema, workerPreviewSourceSchema } from "@theoryfoundry/contracts";
import { ModelSourceRepository, PostgresModelProjectRepository, sha256 } from "@theoryfoundry/model-project";
import { WorkerPreviewSourceService } from "../../dist/worker/preview-source.service.js";
import { expectedBrowserProvenance } from "../../dist/browser-renderer.js";
import { createPostgresFixture } from "../test-support/postgres-fixture.mjs";

const input = { version: "1", projectId: "project" };

test("source contracts require a supported version, exclusive selectors, and a concrete response target", () => {
  for (const invalid of [{ ...input, version: "2" }, { ...input, candidateId: "c", revisionId: "r" },
    { ...input, revisionId: "../file" }, { ...input, candidateId: "" }, { ...input, ownerId: "other" }, { ...input, view: "front" }]) {
    assert.equal(workerPreviewSourceInputSchema.safeParse(invalid).success, false);
  }
  const response = { ...input, source: "cube(1);", sourceHash: sha256("cube(1);"), renderer: expectedBrowserProvenance("cad-validation-v1") };
  assert.equal(workerPreviewSourceSchema.safeParse(response).success, false);
  assert.equal(workerPreviewSourceSchema.safeParse({ ...response, revisionId: "r", candidateId: "c" }).success, false);
  assert.equal(workerPreviewSourceSchema.safeParse({ ...response, revisionId: "r" }).success, true);
  assert.equal(workerPreviewSourceSchema.safeParse({ ...response, candidateId: "c" }).success, true);
});

test("source retrieval enforces hashes and UTF-8 byte limits and preserves storage failures", async () => {
  let target = { revision: "revision", source: "cube(1);", sourceHash: "0".repeat(64) };
  let failure;
  const service = new WorkerPreviewSourceService({ readModelSource: async () => { if (failure) throw failure; return target; } });
  await assert.rejects(service.resolve(input), { code: "SOURCE_HASH_MISMATCH" });
  target = { ...target, source: "é".repeat(CAD_LIMITS.sourceBytes / 2 + 1) };
  target.sourceHash = sha256(target.source);
  await assert.rejects(service.resolve(input), { code: "SOURCE_TOO_LARGE" });
  target = { ...target, source: "é".repeat(CAD_LIMITS.sourceBytes / 2) };
  target.sourceHash = sha256(target.source);
  assert.equal((await service.resolve(input)).sourceHash, target.sourceHash);
  failure = new Error("storage unavailable");
  await assert.rejects(service.resolve(input), error => error === failure);
});

test("PostgreSQL preview sources pin revisions, require VALID candidates, isolate owners and create no jobs", async () => {
  const fixture = await createPostgresFixture();
  const { pool } = fixture;
  try {
    await pool.query(`INSERT INTO "user" (id,name,email) VALUES ('owner','Owner','preview-owner@example.com'),('other','Other','preview-other@example.com')`);
    const repository = new PostgresModelProjectRepository({ pool, ownerId: "owner",
      renderer: { validateAndRender: async () => ({ outcome: "VALID", diagnostics: [], artifacts: [],
        provenance: expectedBrowserProvenance("cad-validation-v1"), validationPolicyVersion: "cad-validation-v1" }) }, acceptRendererProvenance: () => true });
    const { projectId } = await repository.createProject({ name: "Preview source", description: "Immutable targets" });
    const sources = new ModelSourceRepository(pool, "owner");
    const service = new WorkerPreviewSourceService(sources);
    const foreign = new WorkerPreviewSourceService(new ModelSourceRepository(pool, "other"));
    const resolve = selector => service.resolve({ version: "1", projectId, ...selector });
    await assert.rejects(resolve({}), { code: "PROJECT_NOT_FOUND" });
    const propose = (parentRevision, source) => repository.proposeModelSource({ projectId, parentRevision, source, requestId: randomUUID(), toolCallId: randomUUID() });
    const candidate = await propose(null, "cube(10);");
    for (const state of ["CREATED", "RUNNING", "REJECTED", "PROMOTED", "SUPERSEDED"]) {
      await pool.query("UPDATE candidates SET state=$1 WHERE id=$2", [state, candidate.candidateId]);
      await assert.rejects(resolve({ candidateId: candidate.candidateId }), { code: "INVALID_CANDIDATE_STATE" });
    }
    await pool.query("UPDATE candidates SET state='CREATED' WHERE id=$1", [candidate.candidateId]);
    await repository.validateAndRender({ projectId, candidateId: candidate.candidateId, previewProfile: "standard" });
    const valid = await resolve({ candidateId: candidate.candidateId });
    assert.equal(valid.candidateId, candidate.candidateId);
    assert.equal(valid.source, "cube(10);");
    assert.equal(valid.sourceHash, sha256(valid.source));
    assert.equal(acceptsWorkerRenderer(valid.renderer), true);
    assert.equal(valid.renderer.validationPolicyVersion, "cad-validation-v1");
    const revision = await repository.promoteCandidate({ projectId, candidateId: candidate.candidateId, expectedParentRevision: null });
    const original = await resolve({});
    assert.equal(original.revisionId, revision.revisionId);
    await assert.rejects(resolve({ candidateId: candidate.candidateId }), { code: "INVALID_CANDIDATE_STATE" });
    const next = await propose(revision.revisionId, "cube(20);");
    await repository.validateAndRender({ projectId, candidateId: next.candidateId, previewProfile: "standard" });
    const latest = await repository.promoteCandidate({ projectId, candidateId: next.candidateId, expectedParentRevision: revision.revisionId });
    assert.equal((await resolve({})).revisionId, latest.revisionId);
    assert.deepEqual(await resolve({ revisionId: revision.revisionId }), original);
    for (const selector of [{}, { revisionId: revision.revisionId }, { candidateId: candidate.candidateId }]) {
      await assert.rejects(foreign.resolve({ version: "1", projectId, ...selector }), { code: "PROJECT_NOT_FOUND" });
    }
    const another = await repository.createProject({ name: "Other project", description: "Same owner isolation" });
    await assert.rejects(service.resolve({ version: "1", projectId: another.projectId, revisionId: revision.revisionId }), { code: "REVISION_NOT_FOUND" });
    await assert.rejects(service.resolve({ version: "1", projectId: another.projectId, candidateId: candidate.candidateId }), { code: "CANDIDATE_NOT_FOUND" });
    await assert.rejects(resolve({ revisionId: "missing" }), { code: "REVISION_NOT_FOUND" });
    await assert.rejects(resolve({ candidateId: "missing" }), { code: "CANDIDATE_NOT_FOUND" });
    await pool.query("UPDATE revisions SET source='cube(999);' WHERE id=$1", [revision.revisionId]);
    await assert.rejects(resolve({ revisionId: revision.revisionId }), { code: "CORRUPT_PROJECT" });
    const corrupt = await propose(latest.revisionId, "cube(30);");
    await repository.validateAndRender({ projectId, candidateId: corrupt.candidateId, previewProfile: "standard" });
    await pool.query("UPDATE candidates SET source='cube(999);' WHERE id=$1", [corrupt.candidateId]);
    await assert.rejects(resolve({ candidateId: corrupt.candidateId }), { code: "CORRUPT_PROJECT" });
    for (const table of ["browser_presence", "browser_preview_jobs", "worker_validation_jobs", "model_exports"]) {
      assert.equal(Number((await pool.query(`SELECT count(*) AS count FROM ${table}`)).rows[0].count), 0);
    }
  } finally { await fixture.close(); }
});
