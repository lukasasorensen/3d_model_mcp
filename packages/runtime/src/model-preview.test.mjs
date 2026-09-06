import assert from "node:assert/strict";
import test from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { BrowserPresenceRepository, BrowserPreviewJobsRepository, PostgresModelProjectRepository, sha256 } from "@rjls/model-project";
import { getModelPreviewInputSchema } from "@rjls/contracts";
import { PostgresModelPreviewService, validatePreviewCompletion } from "../dist/model-preview-service.js";
import { validatePreviewPng } from "../dist/preview-png.js";
import { expectedBrowserProvenance } from "../dist/browser-renderer.js";
import { createPostgresFixture } from "./test-support/postgres-fixture.mjs";
import { pngFixture } from "./test-support/preview-png.mjs";

const png = pngFixture();
const presence = { sessionId: "tab", tabId: "original-tab", visible: true, ready: true, busy: false, localEnabled: true, remoteEnabled: true };
const provenance = expectedBrowserProvenance("cad-validation-v1");
async function claimEventually(jobs, projectId, mode) {
  for (let n = 0; n < 100; n++) { const job = await jobs.claim(projectId, "tab", [mode]); if (job) return job; await delay(5); }
  assert.fail("Preview job not enqueued");
}
function completion(job) { const { source, deadline, ...binding } = job; void source; void deadline; return { ...binding, sessionId: "tab", png, provenance }; }

test("PNG validation rejects corruption, dimensions, oversized and noncanonical encoding", () => {
  assert.equal(validatePreviewPng(png).toString("base64"), png);
  for (const bad of [png + "\n", "!!!!", pngFixture(1,1), Buffer.alloc(2 * 1024 * 1024 + 1).toString("base64"), png.slice(0, -12)]) assert.throws(() => validatePreviewPng(bad), { code: "INVALID_PREVIEW" });
  const corrupt = Buffer.from(png, "base64"); corrupt[40] ^= 1;
  assert.throws(() => validatePreviewPng(corrupt.toString("base64")), { code: "INVALID_PREVIEW" });
  assert.equal(getModelPreviewInputSchema.safeParse({ projectId: "p", revisionId: "r", candidateId: "c" }).success, false);
});

test("preview notifications, ownership, candidate/revision targets, claims and cleanup for both transports", async () => {
  const fixture = await createPostgresFixture(); const { pool } = fixture;
  const previousOrigin = process.env.BETTER_AUTH_URL; const previousAllowed = process.env.RJLS_ALLOWED_ORIGIN;
  process.env.BETTER_AUTH_URL = "https://cad.example.com"; process.env.RJLS_ALLOWED_ORIGIN = "https://cad.example.com";
  try {
    await pool.query(`INSERT INTO "user" (id,name,email) VALUES ('owner','Owner','owner@example.com'),('other','Other','other@example.com')`);
    const repository = new PostgresModelProjectRepository({ pool, ownerId: "owner", renderer: { validateAndRender: async () => ({ outcome: "VALID", diagnostics: [], provenance, validationPolicyVersion: "cad-validation-v1", artifacts: [] }) }, acceptRendererProvenance: () => true });
    const { projectId } = await repository.createProject();
    const candidate = await repository.proposeModelSource({ projectId, parentRevision: null, source: "cube(10);", requestId: "request", toolCallId: "call" });
    await assert.rejects(repository.readValidatedCandidateSource(projectId, candidate.candidateId), { code: "INVALID_CANDIDATE_STATE" });
    await repository.validateAndRender({ projectId, candidateId: candidate.candidateId, previewProfile: "standard" });
    const jobs = new BrowserPreviewJobsRepository(pool, "owner"); const other = new BrowserPreviewJobsRepository(pool, "other");
    const presences = new BrowserPresenceRepository(pool, "owner");
    const events = []; const stop = await fixture.notifications.subscribe((event) => { if (event) events.push(event); });
    try {
      const candidateInput = { projectId, candidateId: candidate.candidateId, view: "isometric" };
      const service = new PostgresModelPreviewService(fixture, repository, "owner", "remote-mcp");
      await assert.rejects(service.getPreview(candidateInput), (error) => error.code === "BROWSER_REQUIRED" && error.details.projectUrl === `https://cad.example.com/projects/${projectId}`);
      await assert.rejects(new BrowserPresenceRepository(pool, "other").update(projectId, presence), { code: "PROJECT_NOT_FOUND" });
      await presences.update(projectId, { ...presence, visible: false });
      assert.equal(await presences.availability(projectId, "remote-mcp"), "unavailable");
      await presences.update(projectId, { ...presence, busy: true });
      await assert.rejects(service.getPreview(candidateInput), { code: "BROWSER_BUSY" });
      await presences.update(projectId, presence);
      await presences.update(projectId, { ...presence, tabId: "cloned-tab", visible: false });
      assert.equal(await presences.availability(projectId, "remote-mcp"), "ready", "A hidden tab with a copied session ID must not hide the original");
      assert.equal((await pool.query("SELECT count(*) FROM browser_presence")).rows[0].count, 2);
      for (const mode of ["remote-mcp", "local-mcp"]) {
        const active = new PostgresModelPreviewService(fixture, repository, "owner", mode).getPreview(candidateInput);
        const job = await claimEventually(jobs, projectId, mode);
        assert.equal(await other.claim(projectId, "tab", [mode]), undefined);
        assert.equal(await jobs.claim(projectId, "second", [mode]), undefined);
        assert.equal(await jobs.browserStatus(projectId, "tab", job.jobId, job.token), "pending");
        assert.equal(await other.browserStatus(projectId, "tab", job.jobId, job.token), "cancelled");
        assert.equal(await jobs.browserStatus(projectId, "wrong-tab", job.jobId, job.token), "cancelled");
        assert.equal(await jobs.browserStatus(projectId, "tab", job.jobId, "0".repeat(64)), "cancelled");
        const stored = (await pool.query("SELECT token_hash FROM browser_preview_jobs WHERE id = $1", [job.jobId])).rows[0];
        assert.equal(stored.token_hash, sha256(job.token));
        await assert.rejects(jobs.enqueue("another", { ...candidateInput, sourceHash: job.sourceHash, width: 768, height: 768 }, job.source, mode), { code: "BROWSER_BUSY" });
        const receipt = completion(job);
        await assert.rejects(other.complete(receipt), { code: "INVALID_PREVIEW" });
        for (const changed of [{ sessionId: "other" }, { sourceHash: "f".repeat(64) }, { view: "bottom" }, { token: "0".repeat(64) }]) await assert.rejects(jobs.complete({ ...receipt, ...changed }), { code: "INVALID_PREVIEW" });
        assert.throws(() => validatePreviewCompletion({ ...receipt, provenance: { ...provenance, rendererVersion: "wrong" } }), { code: "PROVENANCE_MISMATCH" });
        await jobs.complete(validatePreviewCompletion(receipt));
        await assert.rejects(jobs.complete(receipt), { code: "INVALID_PREVIEW" });
        const result = await active;
        assert.equal(result.png, png); assert.equal(result.metadata.candidateId, candidate.candidateId);
        assert.equal(await jobs.outcome(job.jobId), undefined);
      }
      const revision = await repository.promoteCandidate({ projectId, candidateId: candidate.candidateId, expectedParentRevision: null });
      const active = service.getPreview({ projectId, view: "top" });
      const job = await claimEventually(jobs, projectId, "remote-mcp");
      assert.equal(job.revisionId, revision.revisionId);
      const next = await repository.proposeModelSource({ projectId, parentRevision: revision.revisionId, source: "cube(20);", requestId: "request-next", toolCallId: "call-next" });
      await repository.validateAndRender({ projectId, candidateId: next.candidateId, previewProfile: "standard" });
      const latest = await repository.promoteCandidate({ projectId, candidateId: next.candidateId, expectedParentRevision: revision.revisionId });
      await jobs.complete(completion(job)); assert.equal((await active).metadata.revisionId, revision.revisionId);
      assert.equal((await repository.getProjectState(projectId)).currentRevision, latest.revisionId);
      const historical = service.getPreview({ projectId, revisionId: revision.revisionId, view: "left" });
      const historicalJob = await claimEventually(jobs, projectId, "remote-mcp");
      assert.equal(historicalJob.revisionId, revision.revisionId);
      await jobs.complete(completion(historicalJob)); assert.equal((await historical).metadata.revisionId, revision.revisionId);
      const controller = new AbortController();
      const cancelled = service.getPreview({ projectId, view: "front" }, controller.signal);
      const rejected = assert.rejects(cancelled, { code: "CANCELLED" });
      const pending = await claimEventually(jobs, projectId, "remote-mcp"); controller.abort(); await rejected;
      assert.equal(await jobs.outcome(pending.jobId), undefined);
      assert.equal(await jobs.browserStatus(projectId, "tab", pending.jobId, pending.token), "cancelled");
      await assert.rejects(jobs.complete(completion(pending)), { code: "INVALID_PREVIEW" });
      const expiring = service.getPreview({ projectId, revisionId: revision.revisionId, view: "back" });
      const expired = assert.rejects(expiring, { code: "PREVIEW_TIMEOUT" });
      const expiryJob = await claimEventually(jobs, projectId, "remote-mcp");
      await pool.query("UPDATE browser_preview_jobs SET deadline = now() - interval '1 second' WHERE id = $1", [expiryJob.jobId]);
      await expired;
      await pool.query("UPDATE browser_presence SET updated_at = now() - interval '46 seconds'");
      assert.equal(await presences.availability(projectId, "remote-mcp"), "unavailable");
      assert.ok(events.some((event) => event.kind === "preview"));
      assert.ok(events.filter((event) => event.kind === "preview").every((event) => Object.keys(event).sort().join() === "jobId,kind,ownerId,projectId"));
      events.length = 0;
      await fixture.database.exec("BEGIN");
      await jobs.enqueue("rollback", { projectId, revisionId: revision.revisionId, sourceHash: job.sourceHash, view: "top", width: 768, height: 768 }, "cube(10);", "remote-mcp");
      await fixture.database.exec("ROLLBACK");
      assert.equal(events.length, 0); assert.equal(await jobs.outcome("rollback"), undefined);
    } finally { stop(); }
  } finally {
    if (previousOrigin === undefined) delete process.env.BETTER_AUTH_URL; else process.env.BETTER_AUTH_URL = previousOrigin;
    if (previousAllowed === undefined) delete process.env.RJLS_ALLOWED_ORIGIN; else process.env.RJLS_ALLOWED_ORIGIN = previousAllowed;
    await fixture.close();
  }
});
