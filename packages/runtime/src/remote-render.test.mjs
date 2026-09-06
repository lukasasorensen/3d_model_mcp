import assert from "node:assert/strict";
import test from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { PostgresModelProjectRepository, RemoteRenderJobsRepository, VALIDATION_POLICY_VERSION, sha256 } from "@rjls/model-project";
import { RemoteBrowserRenderer, claimRemoteBrowserRender } from "../dist/remote-browser-renderer.js";
import { PostgresBrowserRenderCoordinator, expectedBrowserProvenance } from "../dist/browser-renderer.js";
import { createPostgresFixture } from "./test-support/postgres-fixture.mjs";

async function waitForClaim(jobs, projectId, sessionId) {
  for (let i = 0; i < 100; i++) {
    const job = await claimRemoteBrowserRender(jobs, projectId, sessionId);
    if (job) return job;
    await delay(10);
  }
  assert.fail("No render job arrived");
}

test("PostgreSQL remote validation, ownership, one-time claims, receipts, and recovery", async () => {
  const fixture = await createPostgresFixture();
  const { pool } = fixture;
  try {
    await pool.query(`INSERT INTO "user" (id,name,email) VALUES ('owner-a','A','a@example.com'),('owner-b','B','b@example.com')`);
    const jobs = new RemoteRenderJobsRepository(pool, "owner-a");
    const otherJobs = new RemoteRenderJobsRepository(pool, "owner-b");
    const renderer = new RemoteBrowserRenderer(jobs, VALIDATION_POLICY_VERSION, fixture.notifications);
    const repository = new PostgresModelProjectRepository({ pool, ownerId: "owner-a", renderer, acceptRendererProvenance: () => true });
    const other = new PostgresModelProjectRepository({ pool, ownerId: "owner-b", renderer, acceptRendererProvenance: () => true });
    const project = await repository.createProject();
    const propose = () => repository.proposeModelSource({ projectId: project.projectId, parentRevision: null, source: "cube(10);", requestId: crypto.randomUUID(), toolCallId: crypto.randomUUID() });
    const candidate = await propose();
    const validation = repository.validateAndRender({ projectId: project.projectId, candidateId: candidate.candidateId, previewProfile: "standard" });
    const claimed = await waitForClaim(jobs, project.projectId, "tab-a");
    assert.equal(await claimRemoteBrowserRender(otherJobs, project.projectId, "tab-b"), undefined);
    assert.equal(await claimRemoteBrowserRender(jobs, project.projectId, "tab-b"), undefined);
    const stored = (await pool.query("SELECT token_hash FROM browser_render_jobs WHERE id = $1", [claimed.jobId])).rows[0];
    assert.equal(stored.token_hash, sha256(claimed.token));
    assert.notEqual(stored.token_hash, claimed.token);
    const completion = { token: claimed.token, sessionId: "tab-a", sourceHash: claimed.sourceHash, outcome: "VALID", diagnostics: [], provenance: expectedBrowserProvenance(VALIDATION_POLICY_VERSION) };
    const coordinator = new PostgresBrowserRenderCoordinator(VALIDATION_POLICY_VERSION, pool, "owner-a");
    const wrongOwner = new PostgresBrowserRenderCoordinator(VALIDATION_POLICY_VERSION, pool, "owner-b");
    await assert.rejects(wrongOwner.complete(claimed.jobId, completion));
    await assert.rejects(coordinator.complete(claimed.jobId, { ...completion, sessionId: "tab-b" }));
    await assert.rejects(coordinator.complete(claimed.jobId, { ...completion, sourceHash: "a".repeat(64) }));
    await coordinator.complete(claimed.jobId, completion);
    await assert.rejects(coordinator.complete(claimed.jobId, completion));
    assert.equal((await validation).state, "VALID");
    const revision = await repository.promoteCandidate({ projectId: project.projectId, candidateId: candidate.candidateId, expectedParentRevision: null });
    await assert.rejects(other.getProjectState(project.projectId), { code: "PROJECT_NOT_FOUND" });
    assert.equal((await repository.getProjectState(project.projectId)).currentRevision, revision.revisionId);

    const next = await repository.proposeModelSource({ projectId: project.projectId, parentRevision: revision.revisionId, source: "cube(20);", requestId: crypto.randomUUID(), toolCallId: crypto.randomUUID() });
    const cancelled = new AbortController();
    const interrupted = repository.validateAndRender({ projectId: project.projectId, candidateId: next.candidateId, previewProfile: "standard", signal: cancelled.signal });
    const interruptedJob = await waitForClaim(jobs, project.projectId, "tab-a");
    cancelled.abort();
    assert.equal((await interrupted).state, "REJECTED");
    await assert.rejects(coordinator.complete(interruptedJob.jobId, { ...completion, token: interruptedJob.token, sourceHash: interruptedJob.sourceHash }));
    assert.equal((await repository.getProjectState(project.projectId)).currentRevision, revision.revisionId);

    await pool.query("UPDATE candidates SET state = 'RUNNING', updated_at = now() - interval '3 minutes' WHERE id = $1", [next.candidateId]);
    await new RemoteRenderJobsRepository(pool, "owner-a").recover();
    assert.equal((await pool.query("SELECT state FROM candidates WHERE id = $1", [next.candidateId])).rows[0].state, "REJECTED");
  } finally { await fixture.close(); }
});

test("atomic claims and expired browser jobs cannot complete or strand candidates", async () => {
  const fixture = await createPostgresFixture();
  const { pool } = fixture;
  try {
    await pool.query(`INSERT INTO "user" (id,name,email) VALUES ('owner','Owner','owner@example.com')`);
    const jobs = new RemoteRenderJobsRepository(pool, "owner");
    const repository = new PostgresModelProjectRepository({ pool, ownerId: "owner", renderer: new RemoteBrowserRenderer(jobs, VALIDATION_POLICY_VERSION, fixture.notifications), acceptRendererProvenance: () => true });
    const project = await repository.createProject();
    const enqueue = async (id) => {
      const candidate = await repository.proposeModelSource({ projectId: project.projectId, parentRevision: null, source: "cube(10);", requestId: crypto.randomUUID(), toolCallId: crypto.randomUUID() });
      await pool.query("UPDATE candidates SET state = 'RUNNING' WHERE id = $1", [candidate.candidateId]);
      await jobs.enqueue(id, { projectId: project.projectId, candidateId: candidate.candidateId, source: "cube(10);", sourceHash: candidate.sourceHash, previewProfile: "standard" });
      return candidate;
    };
    const candidate = await enqueue("race-job");
    const claims = await Promise.all([claimRemoteBrowserRender(jobs, project.projectId, "tab-one"), claimRemoteBrowserRender(jobs, project.projectId, "tab-two")]);
    assert.equal(claims.filter(Boolean).length, 1);
    const job = claims.find(Boolean);
    const coordinator = new PostgresBrowserRenderCoordinator(VALIDATION_POLICY_VERSION, pool, "owner");
    await pool.query("UPDATE browser_render_jobs SET deadline = now() - interval '1 second' WHERE id = $1", [job.jobId]);
    await assert.rejects(coordinator.complete(job.jobId, { token: job.token, sessionId: claims[0] ? "tab-one" : "tab-two", sourceHash: job.sourceHash, outcome: "VALID", diagnostics: [], provenance: expectedBrowserProvenance(VALIDATION_POLICY_VERSION) }));
    assert.equal((await jobs.outcome(job.jobId)).state, "EXPIRED");
    await pool.query("UPDATE candidates SET updated_at = now() - interval '3 minutes' WHERE id = $1", [candidate.candidateId]);
    await jobs.recover();
    assert.equal((await pool.query("SELECT state FROM candidates WHERE id = $1", [candidate.candidateId])).rows[0].state, "REJECTED");
    await enqueue("no-browser");
    await pool.query("UPDATE browser_render_jobs SET claim_deadline = now() - interval '1 second' WHERE id = 'no-browser'");
    assert.equal(await claimRemoteBrowserRender(jobs, project.projectId, "late-tab"), undefined);
    assert.equal((await jobs.outcome("no-browser")).state, "EXPIRED");
    assert.equal((await repository.getProjectState(project.projectId)).currentRevision, null);
  } finally { await fixture.close(); }
});
