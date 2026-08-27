import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { ModelProjectRepository, PostgresModelProjectRepository, createProjectDatabase } from "@rjls/model-project";
import { isBrowserRendererProvenance } from "@rjls/contracts";
import { CAD_TOOL_NAMES } from "@rjls/gateway";
import { streamCadChat } from "@rjls/gateway";
import { BrowserRenderCoordinator, ConfiguredCadRuntimeManager, FilesystemBrowserRenderBridge, PostgresBrowserRenderCoordinator, RUNTIME_BOUNDARY, RuntimeObservabilityStore, createInMemoryCadMcpClient, createObservedReadinessProbe, createStdioCadMcpClient, expectedBrowserProvenance, probeConfiguredReadiness, sanitizeBrowserRenderCompletion } from "../dist/index.js";

test("exposes the local runtime package boundary", () => {
  assert.equal(RUNTIME_BOUNDARY, "runtime");
});

test("configured runtime manager bounds owners and holds stream leases until completion", async () => {
  const closedOwners = [];
  let streamController;
  const manager = new ConfiguredCadRuntimeManager({
    maxEntries: 1,
    idleTtlMs: 60_000,
    createRuntime: async (ownerId) => ({ close: async () => { closedOwners.push(ownerId); } }),
  });
  const response = await manager.withRuntime("owner-a", async () => new Response(new ReadableStream({
    start(controller) { streamController = controller; },
  })));
  await assert.rejects(manager.withRuntime("owner-b", async () => undefined), /at capacity/);
  streamController.enqueue(new TextEncoder().encode("complete"));
  streamController.close();
  assert.equal(await response.text(), "complete");
  await manager.withRuntime("owner-b", async () => undefined);
  assert.deepEqual(closedOwners, ["owner-a"]);
  assert.equal(manager.size, 1);
  await manager.close();
  assert.deepEqual(closedOwners, ["owner-a", "owner-b"]);
});

test("browser render jobs are source-bound, session-bound, and one-time", async () => {
  const coordinator = new BrowserRenderCoordinator("cad-validation-v1");
  let request;
  const unsubscribe = coordinator.subscribe("candidate-1", "session-1", (value) => { request = value; });
  const validation = coordinator.validateAndRender({
    projectId: "project-1", candidateId: "candidate-1", source: "cube(1);", sourceHash: "a".repeat(64), previewProfile: "standard",
  });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(request.sourceHash, "a".repeat(64));
  assert.throws(() => coordinator.complete(request.jobId, {
    token: request.token, sessionId: "wrong-session", sourceHash: request.sourceHash, outcome: "VALID", diagnostics: [], provenance: expectedBrowserProvenance("cad-validation-v1"),
  }), /binding/i);
  coordinator.complete(request.jobId, {
    token: request.token, sessionId: "session-1", sourceHash: request.sourceHash, outcome: "VALID", diagnostics: [], provenance: expectedBrowserProvenance("cad-validation-v1"),
  });
  assert.equal((await validation).outcome, "VALID");
  assert.throws(() => coordinator.complete(request.jobId, {}), /unavailable|expired/i);
  unsubscribe();
});

test("filesystem browser bridge claims across processes and binds one completion", async () => {
  const workspaceRoot = await mkdtemp(join(tmpdir(), "rjls-browser-bridge-"));
  const producer = new FilesystemBrowserRenderBridge(workspaceRoot, "cad-validation-v1", "owner-a");
  const consumer = new FilesystemBrowserRenderBridge(workspaceRoot, "cad-validation-v1", "owner-a");
  const otherOwner = new FilesystemBrowserRenderBridge(workspaceRoot, "cad-validation-v1", "owner-b");
  const validation = producer.validateAndRender({
    projectId: "bridge-project", candidateId: "candidate-1", source: "cube(1);",
    sourceHash: "a".repeat(64), previewProfile: "standard",
  });
  let job;
  assert.equal(await otherOwner.claimNext("bridge-project", "intruder-session"), null);
  for (let attempt = 0; attempt < 20 && !job; attempt += 1) {
    job = await consumer.claimNext("bridge-project", "session-1");
    if (!job) await new Promise((resolve) => setTimeout(resolve, 10));
  }
  assert.ok(job);
  assert.equal(await consumer.claimNext("bridge-project", "session-2"), null);
  await assert.rejects(consumer.complete(job.jobId, {
    token: job.token, sessionId: "session-2", sourceHash: job.sourceHash, outcome: "VALID", diagnostics: [],
    provenance: expectedBrowserProvenance("cad-validation-v1"),
  }), /binding/i);
  const completion = {
    token: job.token, sessionId: "session-1", sourceHash: job.sourceHash, outcome: "VALID", diagnostics: [],
    provenance: expectedBrowserProvenance("cad-validation-v1"),
  };
  await consumer.complete(job.jobId, completion);
  await assert.rejects(consumer.complete(job.jobId, completion), /exist/i);
  assert.equal((await validation).outcome, "VALID");
});

test("database render completion persistence excludes reusable binding secrets", () => {
  const completion = {
    token: "a".repeat(64), sessionId: "session-1", sourceHash: "b".repeat(64), outcome: "VALID", diagnostics: [],
    provenance: expectedBrowserProvenance("cad-validation-v1"),
  };
  assert.deepEqual(sanitizeBrowserRenderCompletion(completion), {
    outcome: "VALID", diagnostics: [], provenance: completion.provenance,
  });
  assert.doesNotMatch(JSON.stringify(sanitizeBrowserRenderCompletion(completion)), /token|sessionId|sourceHash|a{64}|b{64}/);
});

test("PostgreSQL completion updates bind with the raw token but persist only sanitized metadata", async () => {
  let parameters;
  const pool = { async query(_query, values) { parameters = values; return { rows: [{ id: "render-1" }] }; } };
  const coordinator = new PostgresBrowserRenderCoordinator("cad-validation-v1", pool, "owner-1");
  const completion = {
    token: "a".repeat(64), sessionId: "session-1", sourceHash: "b".repeat(64), outcome: "VALID", diagnostics: [],
    provenance: expectedBrowserProvenance("cad-validation-v1"),
  };
  await coordinator.complete("render-1", completion);
  const persisted = JSON.parse(parameters[0]);
  assert.deepEqual(persisted, { outcome: "VALID", diagnostics: [], provenance: completion.provenance });
  assert.notEqual(parameters[4], completion.token);
});

test("configured readiness requires exact official MCP discovery", async () => {
  const exactClient = { listTools: async () => CAD_TOOL_NAMES };
  assert.deepEqual(await probeConfiguredReadiness(exactClient), { status: "ready", profile: "browser-wasm" });
  await assert.rejects(
    probeConfiguredReadiness({ listTools: async () => CAD_TOOL_NAMES.slice(0, -1) }),
    /exact CAD tool surface/,
  );
});

test("production configured readiness retains and exports fail then two-success recovery transitions", async () => {
  const exportedRecords = [];
  const observability = new RuntimeObservabilityStore({ record: (record) => exportedRecords.push(record) });
  let available = false;
  let id = 0;
  const observedProbe = createObservedReadinessProbe(observability, async () => {
    if (!available) throw new Error("renderer unavailable");
    return { status: "ready", profile: "browser-wasm" };
  }, { createId: () => `readiness-${++id}`, clock: () => new Date(`2026-08-06T08:00:0${id}.000Z`) });
  await assert.rejects(observedProbe(), /renderer unavailable/);
  available = true;
  await assert.rejects(observedProbe(), /recovery confirmation/);
  assert.deepEqual(await observedProbe(), { status: "ready", profile: "browser-wasm" });
  const snapshots = observability.snapshot();
  assert.deepEqual(snapshots[0].records.map((record) => [record.event, record.requestId]), [
    ["readiness.unavailable", "readiness-1"],
    ["readiness.ready", "readiness-3"],
  ]);
  assert.deepEqual(exportedRecords, snapshots[0].records);
  assert.equal(observability.drain().length, 1);
});

test("connects the exact CAD surface through the official in-memory MCP client", async () => {
  const workspaceRoot = await mkdtemp(join(tmpdir(), "rjls-runtime-mcp-"));
  const repository = new ModelProjectRepository({
    workspaceRoot,
    renderer: { async validateAndRender() { throw new Error("unused"); } },
    acceptRendererProvenance: () => false,
  });
  const client = await createInMemoryCadMcpClient(repository);
  try {
    assert.deepEqual([...(await client.listTools({}))].sort(), [...CAD_TOOL_NAMES].sort());
  } finally {
    await client.close();
  }
});

test("configured runtime observability retains and exports real request records and bounded metrics", async () => {
  const workspaceRoot = await mkdtemp(join(tmpdir(), "rjls-runtime-observability-"));
  const repository = new ModelProjectRepository({ workspaceRoot, renderer: { async validateAndRender() { throw new Error("unused"); } }, acceptRendererProvenance: () => false });
  const client = await createInMemoryCadMcpClient(repository);
  const exportedRecords = [], exportedMetrics = [];
  const observability = new RuntimeObservabilityStore({ record: (record) => exportedRecords.push(record), metric: (metric) => exportedMetrics.push(metric) }, 2);
  try {
    for await (const event of streamCadChat(
      { version: "3", projectId: "observability-project", sessionId: "observability-session", message: "Inspect token=supersecret /Users/example/private/model.scad" },
      { client, createId: () => "observability-request", createObservabilitySink: observability.createRequestSink },
    )) { void event; }
    const snapshots = observability.snapshot();
    assert.equal(snapshots.length, 1);
    assert.equal(snapshots[0].redactionScan.matches, 0);
    assert.ok(snapshots[0].metrics.some((sample) => sample.name === "request_count"));
    assert.ok(snapshots[0].metrics.some((sample) => sample.name === "tool_rounds"));
    assert.deepEqual(exportedRecords, snapshots[0].records);
    assert.deepEqual(exportedMetrics, snapshots[0].metrics);
    assert.doesNotMatch(JSON.stringify(snapshots), /supersecret|Users\/example|model\.scad/);
    assert.ok(snapshots[0].volume.records <= 1_000 && snapshots[0].volume.metrics <= 1_000 && snapshots[0].volume.serializedBytes <= 1024 * 1024);
    assert.ok(snapshots[0].metrics.every((sample) => Object.keys(sample.labels).every((key) => ["service", "operation", "outcome", "diagnosticCode"].includes(key))));
    assert.equal(observability.drain().length, 1);
    assert.equal(observability.snapshot().length, 0);
  } finally { await client.close(); }
});

test("default stdio adapter negotiates cleanly, propagates cancel, observes child death, and restarts", async () => {
  const workspaceRoot = await mkdtemp(join(tmpdir(), "rjls-runtime-stdio-"));
  const fixture = new URL("./fixtures/stdio-cad-server.mjs", import.meta.url);
  const start = () => createStdioCadMcpClient({ command: process.execPath, args: [fixture.pathname, workspaceRoot], cwd: process.cwd(), stderr: "pipe" });
  const first = await start();
  assert.ok(first.processId);
  assert.deepEqual([...(await first.listTools({}))].sort(), [...CAD_TOOL_NAMES].sort());
  const proposed = await first.callTool("propose_model_source", { projectId: "stdio-project", parentRevision: null, source: "cube([1,1,1]);", requestId: "stdio-request", toolCallId: "stdio-tool" }, {});
  assert.equal(proposed.isError, false);
  const candidateId = proposed.structuredContent.candidate.candidateId;
  const abort = new AbortController();
  const pending = first.callTool("validate_and_render", { projectId: "stdio-project", candidateId, previewProfile: "standard" }, { signal: abort.signal });
  setTimeout(() => abort.abort(), 20);
  await assert.rejects(pending);
  const state = await first.callTool("get_project_state", { projectId: "stdio-project" }, {});
  assert.equal(state.structuredContent.state.currentRevision, null);

  const pid = first.processId;
  process.kill(pid, "SIGTERM");
  await new Promise((resolve) => setTimeout(resolve, 50));
  await assert.rejects(first.listTools({}));
  await first.close();

  const restarted = await start();
  try {
    assert.notEqual(restarted.processId, pid);
    assert.deepEqual([...(await restarted.listTools({}))].sort(), [...CAD_TOOL_NAMES].sort());
    const recovered = await restarted.callTool("get_project_state", { projectId: "stdio-project" }, {});
    assert.equal(recovered.structuredContent.state.currentRevision, null);
  } finally {
    await restarted.close();
  }
});

test("standalone PostgreSQL stdio server validates in an open-browser peer and promotes", { skip: !process.env.RJLS_TEST_DATABASE_URL || !process.env.RJLS_TEST_ACTOR_USER_ID }, async () => {
  const workspaceRoot = await mkdtemp(join(tmpdir(), "rjls-runtime-live-stdio-"));
  const projectId = `stdio-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const database = createProjectDatabase(process.env.RJLS_TEST_DATABASE_URL);
  const repository = new PostgresModelProjectRepository({
    pool: database.pool, ownerId: process.env.RJLS_TEST_ACTOR_USER_ID,
    renderer: { async validateAndRender() { throw new Error("unused"); } },
    acceptRendererProvenance: isBrowserRendererProvenance, createId: () => projectId,
  });
  await repository.createProject();
  const executable = new URL("../dist/stdio-server.js", import.meta.url);
  const client = await createStdioCadMcpClient({
    command: process.execPath,
    args: [executable.pathname],
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_URL: process.env.RJLS_TEST_DATABASE_URL, RJLS_ACTOR_USER_ID: process.env.RJLS_TEST_ACTOR_USER_ID, RJLS_LOCAL_BRIDGE_ROOT: workspaceRoot },
    stderr: "pipe",
  });
  const browser = new FilesystemBrowserRenderBridge(workspaceRoot, "cad-validation-v1", process.env.RJLS_TEST_ACTOR_USER_ID);
  try {
    const proposed = await client.callTool("propose_model_source", {
      projectId, parentRevision: null, source: "cube([10,10,10]);",
      requestId: "stdio-live-request", toolCallId: "stdio-live-propose",
    }, {});
    const candidateId = proposed.structuredContent.candidate.candidateId;
    const pending = client.callTool("validate_and_render", {
      projectId, candidateId, previewProfile: "standard",
    }, {});
    let job;
    for (let attempt = 0; attempt < 40 && !job; attempt += 1) {
      job = await browser.claimNext(projectId, "browser-session");
      if (!job) await new Promise((resolve) => setTimeout(resolve, 10));
    }
    assert.ok(job);
    await browser.complete(job.jobId, {
      token: job.token, sessionId: "browser-session", sourceHash: job.sourceHash,
      outcome: "VALID", diagnostics: [], provenance: expectedBrowserProvenance("cad-validation-v1"),
    });
    const validated = await pending;
    assert.equal(validated.structuredContent.candidate.state, "VALID");
    const promoted = await client.callTool("promote_candidate", {
      projectId, candidateId, expectedParentRevision: null,
    }, {});
    assert.equal(promoted.isError, false);
    const state = await client.callTool("get_project_state", { projectId }, {});
    assert.equal(state.structuredContent.state.currentRevision, promoted.structuredContent.revision.revisionId);
  } finally {
    await client.close();
    await database.close();
  }
});
