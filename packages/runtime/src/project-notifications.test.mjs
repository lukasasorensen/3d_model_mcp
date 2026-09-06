import assert from "node:assert/strict";
import test from "node:test";
import { PostgresModelProjectRepository, RemoteRenderJobsRepository, VALIDATION_POLICY_VERSION } from "@rjls/model-project";
import { createPostgresFixture } from "./test-support/postgres-fixture.mjs";
import { RemoteBrowserRenderer } from "../dist/remote-browser-renderer.js";
import { LocalBrowserRenderer } from "../dist/local-browser-renderer.js";
import { expectedBrowserProvenance } from "../dist/browser-renderer.js";

const tick = () => new Promise((resolve) => setImmediate(resolve));

test("database triggers cover local validation, promotion, restore, rollback, and consistent snapshots", async () => {
  const fixture = await createPostgresFixture();
  const events = [];
  const abort = new AbortController();
  let pending;
  const stop = await fixture.notifications.subscribe((event) => { if (event) events.push(event); });
  try {
    await fixture.pool.query(`INSERT INTO "user" (id,name,email) VALUES ('owner','Owner','owner@example.com')`);
    const jobs = new RemoteRenderJobsRepository(fixture.pool, "owner", "local-mcp");
    const repository = new PostgresModelProjectRepository({ pool: fixture.pool, ownerId: "owner", renderer: new RemoteBrowserRenderer(jobs, VALIDATION_POLICY_VERSION, fixture.notifications), acceptRendererProvenance: () => true });
    const browser = new LocalBrowserRenderer(fixture, "owner", VALIDATION_POLICY_VERSION);
    const { projectId } = await repository.createProject();
    const candidate = await repository.proposeModelSource({ projectId, parentRevision: null, source: "cube(1);", requestId: "request", toolCallId: "tool" });
    let resolveJob;
    const available = new Promise((resolve) => { resolveJob = resolve; });
    const stopJob = await fixture.notifications.subscribe((event) => { if (event?.kind === "render") resolveJob(); });
    pending = repository.validateAndRender({ projectId, candidateId: candidate.candidateId, previewProfile: "standard", signal: abort.signal });
    await available;
    const job = await browser.claimNext(projectId, "tab");
    assert.ok(job);
    assert.equal(await browser.claimNext(projectId, "other-tab"), null);
    assert.equal(await new LocalBrowserRenderer(fixture, "intruder", VALIDATION_POLICY_VERSION).claimNext(projectId, "tab"), null);
    await browser.complete(job.jobId, { token: job.token, sessionId: "tab", sourceHash: job.sourceHash, outcome: "VALID", diagnostics: [], provenance: expectedBrowserProvenance(VALIDATION_POLICY_VERSION) });
    assert.equal((await pending).state, "VALID"); stopJob();
    const revision = await repository.promoteCandidate({ projectId, candidateId: candidate.candidateId, expectedParentRevision: null });
    await tick();
    assert.ok(events.some((event) => event.kind === "project" && event.projectId === projectId));
    const count = events.filter((event) => event.kind === "project").length;
    await fixture.database.exec(`BEGIN; UPDATE projects SET current_revision_id = NULL WHERE id = '${projectId}'; ROLLBACK;`);
    await tick(); assert.equal(events.filter((event) => event.kind === "project").length, count);
    const restored = await repository.restoreRevision({ projectId, revision: revision.revisionId, requestId: "restore", toolCallId: "restore" });
    const snapshot = await repository.getProjectSnapshot(projectId);
    assert.equal(snapshot.state.currentRevision, restored.revisionId);
    assert.deepEqual(snapshot.revisions.map((revision) => revision.revisionId), [restored.revisionId, revision.revisionId]);
    await tick(); assert.equal(events.filter((event) => event.kind === "project").length, count + 1);
    assert.doesNotMatch(JSON.stringify(events), /token|source|completion/);
  } finally { abort.abort(); await pending?.catch(() => undefined); stop(); await fixture.close(); }
});

test("chat rendering observes a completion sent immediately from its browser request callback", async () => {
  const fixture = await createPostgresFixture();
  const abort = new AbortController();
  let pending;
  let stop;
  try {
    const { PostgresBrowserRenderCoordinator } = await import("../dist/browser-renderer.js");
    await fixture.pool.query(`INSERT INTO "user" (id,name,email) VALUES ('chat-owner','Owner','chat@example.com')`);
    const renderer = new PostgresBrowserRenderCoordinator(VALIDATION_POLICY_VERSION, fixture.pool, "chat-owner", fixture.notifications);
    const repository = new PostgresModelProjectRepository({ pool: fixture.pool, ownerId: "chat-owner", renderer, acceptRendererProvenance: () => true });
    const { projectId } = await repository.createProject();
    const candidate = await repository.proposeModelSource({ projectId, parentRevision: null, source: "cube(1);", requestId: "chat-request", toolCallId: "chat-tool" });
    let completion;
    stop = renderer.subscribe(candidate.candidateId, "chat-tab", (job) => {
      completion = renderer.complete(job.jobId, { token: job.token, sessionId: "chat-tab", sourceHash: job.sourceHash, outcome: "VALID", diagnostics: [], provenance: expectedBrowserProvenance(VALIDATION_POLICY_VERSION) });
    });
    pending = repository.validateAndRender({ projectId, candidateId: candidate.candidateId, previewProfile: "standard", signal: abort.signal });
    assert.equal((await pending).state, "VALID");
    await completion;
  } finally { abort.abort(); await pending?.catch(() => undefined); stop?.(); await fixture.close(); }
});
