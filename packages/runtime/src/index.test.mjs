import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { ModelProjectRepository } from "@rjls/model-project";
import { CAD_TOOL_NAMES } from "@rjls/gateway";
import { streamCadChat } from "@rjls/gateway";
import { BrowserRenderCoordinator, RUNTIME_BOUNDARY, RuntimeObservabilityStore, createInMemoryCadMcpClient, createObservedReadinessProbe, createStdioCadMcpClient, expectedBrowserProvenance, probeConfiguredReadiness } from "../dist/index.js";

test("exposes the local runtime package boundary", () => {
  assert.equal(RUNTIME_BOUNDARY, "runtime");
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
