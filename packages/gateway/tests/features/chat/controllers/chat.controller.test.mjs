import { chatEventSchema } from "@theoryfoundry/contracts";
import assert from "node:assert/strict";
import test from "node:test";
import { createChatRouteHandler } from "../../../../dist/index.js";
import { exactClient, request } from "../../../fixtures/chat.fixture.mjs";
test("chat HTTP admission enforces exact origin, session, and streamed byte limits", async () => {
  let admitted = 0;
  const handler = createChatRouteHandler({
    allowedOrigin: "http://localhost:3000",
    getOrchestrator: async () => {
      admitted += 1;
      return {
        client: exactClient(async () => ({
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
        })),
        createId: () => "request-http",
      };
    },
  });
  const headers = {
    origin: "http://localhost:3000",
    "content-type": "application/json",
    "x-theoryfoundry-session-id": "session-1",
  };
  const denied = await handler(
    new Request("http://localhost/v1/chat", {
      method: "POST",
      headers: { ...headers, origin: "http://evil.invalid" },
      body: JSON.stringify(request),
    }),
  );
  assert.equal(denied.status, 403);
  assert.equal(admitted, 0);
  const mismatch = await handler(
    new Request("http://localhost/v1/chat", {
      method: "POST",
      headers: { ...headers, "x-theoryfoundry-session-id": "other" },
      body: JSON.stringify(request),
    }),
  );
  assert.equal(mismatch.status, 409);
  const oversized = await handler(
    new Request("http://localhost/v1/chat", {
      method: "POST",
      headers,
      body: new ReadableStream({
        start(controller) {
          controller.enqueue(
            new TextEncoder().encode(
              `{"version":"3","projectId":"project-1","sessionId":"session-1","message":"${"x".repeat(33 * 1024)}`,
            ),
          );
          controller.close();
        },
      }),
      duplex: "half",
    }),
  );
  assert.equal(oversized.status, 413);
  const accepted = await handler(
    new Request("http://localhost/v1/chat", {
      method: "POST",
      headers,
      body: JSON.stringify(request),
    }),
  );
  assert.equal(accepted.status, 200);
  assert.equal(
    accepted.headers.get("content-type"),
    "application/x-ndjson; charset=utf-8",
  );
  const lines = (await accepted.text()).trim().split("\n").map(JSON.parse);
  assert.ok(lines.every((event) => chatEventSchema.safeParse(event).success));
  assert.equal(lines.filter((event) => event.type === "done").length, 1);
});

test("response consumer cancellation aborts MCP work and prevents later mutation", async () => {
  let resolveAbort;
  const abortObserved = new Promise((resolve) => {
    resolveAbort = resolve;
  });
  let mutations = 0;
  let calls = 0;
  const handler = createChatRouteHandler({
    allowedOrigin: "http://localhost:3000",
    getOrchestrator: async () => ({
      createId: () => "request-response-cancel",
      client: exactClient(async (_name, _input, options) => {
        calls += 1;
        return new Promise((resolve) => {
          const timer = setTimeout(() => {
            mutations += 1;
            resolve({
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
            });
          }, 100);
          const cancelled = () => {
            clearTimeout(timer);
            resolveAbort();
            resolve({
              isError: true,
              error: { code: "CANCELLED", message: "cancelled" },
            });
          };
          options.signal?.addEventListener("abort", cancelled, { once: true });
          if (options.signal?.aborted) cancelled();
        });
      }),
    }),
  });
  const response = await handler(
    new Request("http://localhost/v1/chat", {
      method: "POST",
      headers: {
        origin: "http://localhost:3000",
        "content-type": "application/json",
        "x-theoryfoundry-session-id": "session-1",
      },
      body: JSON.stringify(request),
    }),
  );
  const reader = response.body.getReader();
  const first = await reader.read();
  assert.equal(first.done, false);
  await reader.cancel("consumer closed");
  await abortObserved;
  assert.equal(calls, 1);
  assert.equal(mutations, 0);
});
