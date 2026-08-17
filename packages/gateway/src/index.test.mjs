import assert from "node:assert/strict";
import test from "node:test";
import { FakeToolCallingModel, createAgent, tool, toolCallLimitMiddleware } from "langchain";
import { z } from "zod";
import { CAD_LIMITS, CHAT_LIMITS, chatEventSchema } from "@rjls/contracts";
import { CAD_TOOL_NAMES, DeterministicMockCadProvider, GATEWAY_BOUNDARY, createChatRouteHandler, streamCadChat } from "../dist/index.js";

test("exposes the gateway package boundary", () => {
  assert.equal(GATEWAY_BOUNDARY, "gateway");
});

const request = { version: "3", projectId: "project-1", sessionId: "session-1", message: "Inspect the project" };

async function collect(stream) { const values = []; for await (const value of stream) values.push(value); return values; }

function exactClient(callTool) {
  return { listTools: async () => CAD_TOOL_NAMES, callTool };
}

test("runs the real LangChain agent and projects a monotonic NDJSON-safe stream", async () => {
  const calls = [];
  const client = exactClient(async (name, input) => {
    calls.push({ name, input });
    return { isError: false, structuredContent: { state: { projectId: "project-1", currentRevision: null, source: null, artifacts: [], diagnostics: [] } } };
  });
  const events = await collect(streamCadChat(request, { client, createId: () => "request-1" }));
  assert.equal(calls.length, 1);
  assert.equal(calls[0].name, "get_project_state");
  assert.ok(events.every((event) => chatEventSchema.safeParse(event).success));
  assert.deepEqual(events.map((event) => event.sequence), events.map((_, index) => index));
  assert.equal(events.filter((event) => event.type === "done").length, 1);
  assert.equal(events.at(-1).type, "done");
});

test("emits causal observability from the real agent and public MCP results", async () => {
  const records = [];
  const metrics = [];
  const client = exactClient(async (name) => name === "validate_and_render"
    ? { isError: false, structuredContent: { candidate: { candidateId: "candidate-1", state: "VALID" } } }
    : { isError: false, structuredContent: { state: { projectId: "project-1", currentRevision: null, source: null, artifacts: [], diagnostics: [] } } });
  await collect(streamCadChat(request, {
    client,
    createId: () => "request-observed",
    createObservabilitySink: () => ({ record: (event) => records.push(event), metric: (sample) => metrics.push(sample) }),
  }));
  assert.equal(records.filter((record) => record.event === "agent.turn").length, 1);
  assert.ok(records.some((record) => record.event === "chat.tool_start" && record.toolCallId === "request-observed-t1"));
  assert.ok(records.some((record) => record.event === "chat.done" && record.outcome === "success"));
  assert.ok(records.every((record) => record.requestId === "request-observed" && record.conversationId === request.sessionId));
  assert.doesNotMatch(JSON.stringify(records), new RegExp(request.message));
  assert.ok(metrics.some((sample) => sample.name === "request_count" && sample.labels.outcome === "success"));
  assert.ok(metrics.some((sample) => sample.name === "tool_rounds" && sample.value === 1));
  assert.ok(metrics.every((sample) => Object.keys(sample.labels).every((key) => ["service", "operation", "outcome", "diagnosticCode"].includes(key))));
});

test("emits invalid-candidate, promotion-conflict, render, and recovery metrics from MCP outcomes", async () => {
  const provider = {
    id: "observability-outcomes",
    createModel() {
      return new FakeToolCallingModel({ toolCalls: [
        [{ id: "validate-call", name: "validate_and_render", args: { projectId: "project-1", candidateId: "candidate-bad", previewProfile: "standard" } }],
        [{ id: "promote-call", name: "promote_candidate", args: { projectId: "project-1", candidateId: "candidate-stale", expectedParentRevision: null } }],
        [{ id: "restore-call", name: "restore_revision", args: { projectId: "project-1", revision: "revision-old" } }],
        [],
      ] });
    },
  };
  const client = exactClient(async (name) => {
    if (name === "validate_and_render") return { isError: false, structuredContent: { candidate: { candidateId: "candidate-bad", state: "REJECTED", artifacts: [] } } };
    if (name === "promote_candidate") return { isError: true, error: { code: "STALE_REVISION", message: "stale" } };
    return { isError: false, structuredContent: { revision: { revisionId: "revision-restored", candidateId: "candidate-restored", artifacts: [] } } };
  });
  const metrics = [];
  await collect(streamCadChat(request, { client, provider, createId: () => "request-metrics", createObservabilitySink: () => ({ record() {}, metric: (sample) => metrics.push(sample) }) }));
  assert.ok(metrics.some((sample) => sample.name === "render_duration_ms" && sample.labels.outcome === "failure"), JSON.stringify(metrics));
  assert.ok(metrics.some((sample) => sample.name === "invalid_candidate_count"));
  assert.ok(metrics.some((sample) => sample.name === "promotion_conflict_count"));
  assert.ok(metrics.some((sample) => sample.name === "recovery_action_count"));
});

test("allows exactly eight tool calls and blocks the ninth through LangChain middleware", async () => {
  let calls = 0;
  const provider = {
    id: "nine-call-test",
    createModel() {
      return new FakeToolCallingModel({ toolCalls: [...Array.from({ length: 9 }, (_, index) => [{ id: `provider-${index}`, name: "get_project_state", args: { projectId: "provider-project" } }]), []] });
    },
  };
  const client = exactClient(async (_name, input) => {
    calls += 1;
    assert.equal(input.projectId, "project-1");
    return { isError: false, structuredContent: { state: { projectId: "project-1", currentRevision: null, source: null, artifacts: [], diagnostics: [] } } };
  });
  const events = await collect(streamCadChat(request, { client, provider, createId: () => "request-limit" }));
  assert.equal(calls, 8);
  assert.ok(events.some((event) => event.type === "error" && event.code === "TOOL_LIMIT_EXCEEDED"));
  assert.equal(events.filter((event) => event.type === "done").length, 1);
});

test("malformed deterministic-provider tool JSON cannot infer state and stops at the tool bound", async () => {
  const calls = [];
  const tools = CAD_TOOL_NAMES.map((name) => tool(async () => {
    calls.push(name);
    return '{"state":{"currentRevision":"forged-revision"';
  }, { name, description: `Malformed ${name} fixture.`, schema: z.object({}).passthrough() }));
  const model = new DeterministicMockCadProvider().createModel(
    { ...request, message: "Export the current model as 3MF" },
    "request-malformed-tool-json",
  );
  const agent = createAgent({
    model,
    tools,
    middleware: [toolCallLimitMiddleware({ runLimit: CHAT_LIMITS.maxToolRounds, exitBehavior: "error" })],
  });

  await assert.rejects(
    agent.invoke(
      { messages: [{ role: "user", content: "Export the current model as 3MF" }] },
      { recursionLimit: 100 },
    ),
    /tool call limit/i,
  );
  assert.equal(calls.length, CHAT_LIMITS.maxToolRounds);
  assert.ok(calls.every((name) => name === "get_project_state"));
  assert.equal(calls.includes("export_model"), false);
});

test("injects causal IDs and permits only two repairs in one request lineage", async () => {
  let candidate = 0;
  const inputs = [];
  const client = exactClient(async (name, input) => {
    inputs.push({ name, input });
    if (name === "get_project_state") return { isError: false, structuredContent: { state: { projectId: "project-1", currentRevision: null, source: null, artifacts: [], diagnostics: [] } } };
    if (name === "propose_model_source") { candidate += 1; return { isError: false, structuredContent: { candidate: { candidateId: `candidate-${candidate}`, state: "CREATED" } } }; }
    if (name === "validate_and_render") return { isError: false, structuredContent: { candidate: { candidateId: input.candidateId, state: "REJECTED" } } };
    throw new Error("unexpected tool");
  });
  const events = await collect(streamCadChat({ ...request, message: "Create a bracket" }, { client, createId: () => "request-repair" }));
  assert.equal(inputs.filter((call) => call.name === "propose_model_source").length, 3);
  for (const [index, call] of inputs.entries()) {
    assert.equal(call.input.projectId, "project-1");
    if (call.name === "propose_model_source") {
      assert.equal(call.input.requestId, "request-repair");
      assert.equal(call.input.toolCallId, `request-repair-t${index + 1}`);
    }
  }
  assert.equal(events.filter((event) => event.type === "revision" && event.status === "candidate_rejected").length, 3);
  assert.ok(events.some((event) => event.type === "error" && event.code === "REPAIR_LIMIT_EXCEEDED"));
  assert.equal(events.filter((event) => event.type === "done").length, 1);
});

test("atomically blocks parallel fresh-candidate repair bypass before MCP invocation", async () => {
  const proposals = Array.from({ length: 4 }, (_, index) => ({ id: `parallel-propose-${index}`, name: "propose_model_source", args: { projectId: "provider-project", parentRevision: null, source: `cube(${index + 1});` } }));
  const validations = Array.from({ length: 4 }, (_, index) => ({ id: `parallel-validate-${index}`, name: "validate_and_render", args: { projectId: "provider-project", candidateId: `candidate-${index + 1}`, previewProfile: "standard" } }));
  const provider = { id: "parallel-repair-bypass", createModel() { return new FakeToolCallingModel({ toolCalls: [proposals, validations, []] }); } };
  const invoked = [];
  const client = exactClient(async (name, input) => {
    invoked.push({ name, input });
    if (name === "propose_model_source") return { isError: false, structuredContent: { candidate: { candidateId: `candidate-${invoked.length}`, state: "CREATED" } } };
    return { isError: false, structuredContent: { candidate: { candidateId: input.candidateId, state: "REJECTED" } } };
  });
  const events = await collect(streamCadChat(request, { client, provider, createId: () => "request-parallel-repair" }));
  assert.equal(invoked.filter((call) => call.name === "propose_model_source").length, 3);
  assert.equal(invoked.filter((call) => call.name === "validate_and_render").length, 0);
  assert.ok(events.some((event) => event.type === "error" && event.code === "REPAIR_LIMIT_EXCEEDED"));
  assert.equal(events.at(-1).outcome, "failed");
});

test("rejects oversized UTF-8 MCP results before model context", async () => {
  const provider = { id: "oversized-result", createModel() { return new FakeToolCallingModel({ toolCalls: [[{ id: "large", name: "get_project_state", args: { projectId: "provider-project" } }], []] }); } };
  const canary = "秘密".repeat(600_000);
  assert.ok(new TextEncoder().encode(JSON.stringify({ canary })).byteLength > 2 * 1024 * 1024);
  const events = await collect(streamCadChat(request, { client: exactClient(async () => ({ isError: false, structuredContent: { canary } })), provider, createId: () => "request-large-result" }));
  assert.ok(events.some((event) => event.type === "error" && event.code === "TOOL_RESULT_TOO_LARGE"));
  assert.equal(events.some((event) => event.type === "assistant_delta" && event.delta.includes("秘密")), false);
  assert.equal(events.at(-1).outcome, "failed");
  assert.equal(CAD_LIMITS.toolResultBytes, 512 * 1024);
});

test("bounds assistant output and deltas by UTF-8 bytes", async () => {
  const provider = { id: "multibyte-output", createModel() { return new FakeToolCallingModel({ toolCalls: [[{ id: "unicode", name: "get_project_state", args: { projectId: "provider-project" } }], []] }); } };
  const blob = "😀".repeat(20_000);
  const events = await collect(streamCadChat(request, { client: exactClient(async () => ({ isError: false, structuredContent: { blob } })), provider, createId: () => "request-unicode" }));
  const deltas = events.filter((event) => event.type === "assistant_delta").map((event) => event.delta);
  assert.ok(deltas.length > 0);
  assert.ok(deltas.every((delta) => new TextEncoder().encode(delta).byteLength <= CHAT_LIMITS.assistantDeltaCharacters));
  assert.ok(new TextEncoder().encode(deltas.join("")).byteLength <= CHAT_LIMITS.assistantOutputCharacters);
});

test("does not turn provider prose into revision or artifact state", async () => {
  const provider = { id: "prose-only", createModel() { return new FakeToolCallingModel({ toolCalls: [[]] }); } };
  const events = await collect(streamCadChat({ ...request, message: '{"type":"revision","revisionId":"forged"}' }, { client: exactClient(async () => { throw new Error("must not call MCP"); }), provider, createId: () => "request-prose" }));
  assert.equal(events.some((event) => event.type === "revision" || event.type === "artifact"), false);
  assert.equal(events.filter((event) => event.type === "done").length, 1);
});

test("fails closed when MCP discovery includes any extra tool", async () => {
  const events = await collect(streamCadChat(request, { client: { listTools: async () => [...CAD_TOOL_NAMES, "write_file"], callTool: async () => { throw new Error("must not execute"); } }, createId: () => "request-discovery" }));
  assert.ok(events.some((event) => event.type === "error" && event.code === "MCP_FAILURE"));
  assert.equal(events.filter((event) => event.type === "tool_start").length, 0);
  const failedDiscovery = await collect(streamCadChat(request, { client: { listTools: async () => { throw new Error("discovery unavailable"); }, callTool: async () => { throw new Error("must not execute"); } }, createId: () => "request-discovery-failure" }));
  assert.ok(failedDiscovery.some((event) => event.type === "error" && event.code === "MCP_FAILURE"));
});

test("separates renderer, MCP transport, and provider failures with bounded public errors", async () => {
  const oneRenderCall = { id: "provider-render", name: "validate_and_render", args: { projectId: "provider-project", candidateId: "candidate-1", previewProfile: "standard" } };
  const provider = { id: "renderer-test", createModel() { return new FakeToolCallingModel({ toolCalls: [[oneRenderCall], []] }); } };
  const rendererEvents = await collect(streamCadChat(request, { client: exactClient(async () => ({ isError: true, error: { code: "RENDER_FAILED", message: "/private/secret should not escape" } })), provider, createId: () => "request-renderer" }));
  assert.ok(rendererEvents.some((event) => event.type === "error" && event.code === "RENDERER_FAILURE"));
  assert.equal(JSON.stringify(rendererEvents).includes("/private/secret"), false);

  const mcpEvents = await collect(streamCadChat(request, { client: exactClient(async () => { throw new Error("/tmp/mcp-secret"); }), createId: () => "request-mcp" }));
  assert.ok(mcpEvents.some((event) => event.type === "error" && event.code === "MCP_FAILURE"));
  assert.equal(JSON.stringify(mcpEvents).includes("/tmp/mcp-secret"), false);

  const badProvider = { id: "bad", createModel() { throw new Error("provider-key-canary"); } };
  const providerEvents = await collect(streamCadChat(request, { client: exactClient(async () => { throw new Error("unused"); }), provider: badProvider, createId: () => "request-provider" }));
  assert.ok(providerEvents.some((event) => event.type === "error" && event.code === "PROVIDER_FAILURE"));
  assert.equal(JSON.stringify(providerEvents).includes("provider-key-canary"), false);
});

test("propagates cancellation and isolates concurrent request state", async () => {
  let mcpObservedAbort = false;
  const slowClient = exactClient(async (_name, _input, options) => new Promise((resolve) => {
    const cancel = () => { mcpObservedAbort = true; resolve({ isError: true, error: { code: "CANCELLED", message: "cancelled" } }); };
    options.signal?.addEventListener("abort", cancel, { once: true });
    if (options.signal?.aborted) cancel();
  }));
  const controller = new AbortController();
  const cancelledPromise = collect(streamCadChat(request, { client: slowClient, createId: () => "request-cancel" }, controller.signal));
  setTimeout(() => controller.abort(), 5);
  const cancelled = await cancelledPromise;
  assert.equal(mcpObservedAbort, true);
  assert.ok(cancelled.some((event) => event.type === "error" && event.code === "CANCELLED"));
  assert.equal(cancelled.at(-1).outcome, "cancelled");

  const client = exactClient(async () => ({ isError: false, structuredContent: { state: { projectId: "project-1", currentRevision: null, source: null, artifacts: [], diagnostics: [] } } }));
  const [left, right] = await Promise.all([
    collect(streamCadChat(request, { client, createId: () => "request-left" })),
    collect(streamCadChat({ ...request, sessionId: "session-2" }, { client, createId: () => "request-right" })),
  ]);
  assert.ok(left.every((event) => event.requestId === "request-left" && event.sessionId === "session-1"));
  assert.ok(right.every((event) => event.requestId === "request-right" && event.sessionId === "session-2"));
  assert.equal(left[0].sequence, 0);
  assert.equal(right[0].sequence, 0);
});

test("chat HTTP admission enforces exact origin, session, and streamed byte limits", async () => {
  let admitted = 0;
  const handler = createChatRouteHandler({
    allowedOrigin: "http://localhost:3000",
    getOrchestrator: async () => { admitted += 1; return { client: exactClient(async () => ({ isError: false, structuredContent: { state: { projectId: "project-1", currentRevision: null, source: null, artifacts: [], diagnostics: [] } } })), createId: () => "request-http" }; },
  });
  const headers = { origin: "http://localhost:3000", "content-type": "application/json", "x-rjls-session-id": "session-1" };
  const denied = await handler(new Request("http://localhost/v1/chat", { method: "POST", headers: { ...headers, origin: "http://evil.invalid" }, body: JSON.stringify(request) }));
  assert.equal(denied.status, 403);
  assert.equal(admitted, 0);
  const mismatch = await handler(new Request("http://localhost/v1/chat", { method: "POST", headers: { ...headers, "x-rjls-session-id": "other" }, body: JSON.stringify(request) }));
  assert.equal(mismatch.status, 409);
  const oversized = await handler(new Request("http://localhost/v1/chat", { method: "POST", headers, body: new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode(`{"version":"3","projectId":"project-1","sessionId":"session-1","message":"${"x".repeat(33 * 1024)}`)); controller.close(); } }), duplex: "half" }));
  assert.equal(oversized.status, 413);
  const accepted = await handler(new Request("http://localhost/v1/chat", { method: "POST", headers, body: JSON.stringify(request) }));
  assert.equal(accepted.status, 200);
  assert.equal(accepted.headers.get("content-type"), "application/x-ndjson; charset=utf-8");
  const lines = (await accepted.text()).trim().split("\n").map(JSON.parse);
  assert.ok(lines.every((event) => chatEventSchema.safeParse(event).success));
  assert.equal(lines.filter((event) => event.type === "done").length, 1);
});

test("response consumer cancellation aborts MCP work and prevents later mutation", async () => {
  let resolveAbort;
  const abortObserved = new Promise((resolve) => { resolveAbort = resolve; });
  let mutations = 0;
  let calls = 0;
  const handler = createChatRouteHandler({
    allowedOrigin: "http://localhost:3000",
    getOrchestrator: async () => ({
      createId: () => "request-response-cancel",
      client: exactClient(async (_name, _input, options) => {
        calls += 1;
        return new Promise((resolve) => {
          const timer = setTimeout(() => { mutations += 1; resolve({ isError: false, structuredContent: { state: { projectId: "project-1", currentRevision: null, source: null, artifacts: [], diagnostics: [] } } }); }, 100);
          const cancelled = () => { clearTimeout(timer); resolveAbort(); resolve({ isError: true, error: { code: "CANCELLED", message: "cancelled" } }); };
          options.signal?.addEventListener("abort", cancelled, { once: true });
          if (options.signal?.aborted) cancelled();
        });
      }),
    }),
  });
  const response = await handler(new Request("http://localhost/v1/chat", { method: "POST", headers: { origin: "http://localhost:3000", "content-type": "application/json", "x-rjls-session-id": "session-1" }, body: JSON.stringify(request) }));
  const reader = response.body.getReader();
  const first = await reader.read();
  assert.equal(first.done, false);
  await reader.cancel("consumer closed");
  await abortObserved;
  assert.equal(calls, 1);
  assert.equal(mutations, 0);
});
