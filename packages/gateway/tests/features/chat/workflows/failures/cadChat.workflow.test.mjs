import { FakeToolCallingModel } from "langchain";
import assert from "node:assert/strict";
import test from "node:test";
import { streamCadChat } from "../../../../../dist/index.js";
import {
  collect,
  exactClient,
  request,
} from "../../../../fixtures/chat.fixture.mjs";
test("separates renderer, MCP transport, and provider failures with bounded public errors", async () => {
  const oneRenderCall = {
    id: "provider-render",
    name: "validate_and_render",
    args: {
      projectId: "provider-project",
      candidateId: "candidate-1",
      previewProfile: "standard",
    },
  };
  const provider = {
    id: "renderer-test",
    createModel() {
      return new FakeToolCallingModel({ toolCalls: [[oneRenderCall], []] });
    },
  };
  const rendererEvents = await collect(
    streamCadChat(request, {
      client: exactClient(async () => ({
        isError: true,
        error: {
          code: "RENDER_FAILED",
          message: "/private/secret should not escape",
        },
      })),
      provider,
      createId: () => "request-renderer",
    }),
  );
  assert.ok(
    rendererEvents.some(
      (event) => event.type === "error" && event.code === "RENDERER_FAILURE",
    ),
  );
  assert.equal(
    JSON.stringify(rendererEvents).includes("/private/secret"),
    false,
  );

  const mcpEvents = await collect(
    streamCadChat(request, {
      client: exactClient(async () => {
        throw new Error("/tmp/mcp-secret");
      }),
      createId: () => "request-mcp",
    }),
  );
  assert.ok(
    mcpEvents.some(
      (event) => event.type === "error" && event.code === "MCP_FAILURE",
    ),
  );
  assert.equal(JSON.stringify(mcpEvents).includes("/tmp/mcp-secret"), false);

  const badProvider = {
    id: "bad",
    createModel() {
      throw new Error("provider-key-canary");
    },
  };
  const providerEvents = await collect(
    streamCadChat(request, {
      client: exactClient(async () => {
        throw new Error("unused");
      }),
      provider: badProvider,
      createId: () => "request-provider",
    }),
  );
  assert.ok(
    providerEvents.some(
      (event) => event.type === "error" && event.code === "PROVIDER_FAILURE",
    ),
  );
  assert.equal(
    JSON.stringify(providerEvents).includes("provider-key-canary"),
    false,
  );
});

test("propagates cancellation and isolates concurrent request state", async () => {
  let mcpObservedAbort = false;
  const slowClient = exactClient(
    async (_name, _input, options) =>
      new Promise((resolve) => {
        const cancel = () => {
          mcpObservedAbort = true;
          resolve({
            isError: true,
            error: { code: "CANCELLED", message: "cancelled" },
          });
        };
        options.signal?.addEventListener("abort", cancel, { once: true });
        if (options.signal?.aborted) cancel();
      }),
  );
  const controller = new AbortController();
  const cancelledPromise = collect(
    streamCadChat(
      request,
      { client: slowClient, createId: () => "request-cancel" },
      controller.signal,
    ),
  );
  setTimeout(() => controller.abort(), 5);
  const cancelled = await cancelledPromise;
  assert.equal(mcpObservedAbort, true);
  assert.ok(
    cancelled.some(
      (event) => event.type === "error" && event.code === "CANCELLED",
    ),
  );
  assert.equal(cancelled.at(-1).outcome, "cancelled");

  const client = exactClient(async () => ({
    isError: false,
    structuredContent: {
      state: {
        projectId: "project-1",
        currentRevision: null,
        source: null,
        artifacts: [],
        diagnostics: [],
      },
    },
  }));
  const [left, right] = await Promise.all([
    collect(streamCadChat(request, { client, createId: () => "request-left" })),
    collect(
      streamCadChat(
        { ...request, sessionId: "session-2" },
        { client, createId: () => "request-right" },
      ),
    ),
  ]);
  assert.ok(
    left.every(
      (event) =>
        event.requestId === "request-left" && event.sessionId === "session-1",
    ),
  );
  assert.ok(
    right.every(
      (event) =>
        event.requestId === "request-right" && event.sessionId === "session-2",
    ),
  );
  assert.equal(left[0].sequence, 0);
  assert.equal(right[0].sequence, 0);
});
