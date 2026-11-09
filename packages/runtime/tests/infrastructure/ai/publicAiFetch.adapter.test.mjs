import assert from "node:assert/strict";
import test from "node:test";
import { AI_LIMITS, safeAiError } from "@theoryfoundry/contracts";
import { createConnectionModel } from "@theoryfoundry/gateway";
import { boundedAiResponse } from "../../../dist/infrastructure/ai/publicAiFetch.adapter.js";

function resource() {
  return {
    completed: 0,
    aborted: 0,
    async complete() {
      this.completed++;
    },
    async abort() {
      this.aborted++;
    },
  };
}
test("normal JSON and SSE framing complete and release their transports", async () => {
  for (const [type, value] of [
    ["application/json", '{"ok":true}'],
    ["text/event-stream; charset=utf-8", ":".repeat(AI_LIMITS.resultBytes + 1)],
  ]) {
    const lifetime = resource();
    const result = await boundedAiResponse(
      new Response(value, { headers: { "content-type": type } }),
      lifetime,
    );
    assert.equal(await result.text(), value);
    assert.equal(lifetime.completed, 1);
    assert.equal(lifetime.aborted, 0);
  }
});
for (const [type, budget] of [
  ["application/json", AI_LIMITS.resultBytes],
  ["text/event-stream", AI_LIMITS.providerStreamBytes],
]) {
  test(`${type} stops oversized decoded streams and cancels upstream before EOF`, async () => {
    let reads = 0;
    let cancelled = 0;
    const lifetime = resource();
    const source = new ReadableStream({
      pull(controller) {
        reads++;
        controller.enqueue(new Uint8Array(64 * 1024));
      },
      cancel() {
        cancelled++;
      },
    });
    const result = await boundedAiResponse(
      new Response(source, {
        headers: {
          "content-type": type,
          "content-encoding": "gzip",
          "content-length": "1",
        },
      }),
      lifetime,
    );
    await assert.rejects(result.text(), { code: "AI_RESPONSE_TOO_LARGE" });
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(cancelled, 1);
    assert.equal(lifetime.aborted, 1);
    assert.equal(lifetime.completed, 0);
    assert.ok(reads <= budget / (64 * 1024) + 2, reads);
  });
}
test("consumer cancellation releases the transport even if upstream cancellation fails", async () => {
  const lifetime = resource();
  const result = await boundedAiResponse(
    new Response(
      new ReadableStream({
        cancel() {
          throw new Error("cancel failed");
        },
      }),
    ),
    lifetime,
  );
  await assert.rejects(result.body.cancel(), /cancel failed/);
  assert.equal(lifetime.aborted, 1);
});
test("a failed graceful close falls back to destroying the transport", async () => {
  const lifetime = resource();
  lifetime.complete = async () => {
    lifetime.completed++;
    throw new Error("close failed");
  };
  const result = await boundedAiResponse(new Response("ok"), lifetime);
  assert.equal(await result.text(), "ok");
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(lifetime.completed, 1);
  assert.equal(lifetime.aborted, 1);
});
test("the OpenAI-compatible SDK rejects an oversized response instead of accumulating it", async () => {
  const lifetime = resource();
  const model = createConnectionModel({
    provider: "openai-compatible",
    model: "fixture",
    endpoint: "https://fixture.invalid/v1",
    token: "fixture-token",
    fetch: async () =>
      boundedAiResponse(
        Response.json({
          id: "oversized",
          choices: [
            {
              index: 0,
              message: { role: "assistant", content: "x".repeat(1024 * 1024) },
              finish_reason: "stop",
            },
          ],
        }),
        lifetime,
      ),
  });
  await assert.rejects(
    model.invoke("check"),
    (error) => safeAiError(error).code === "AI_RESPONSE_TOO_LARGE",
  );
  assert.equal(lifetime.aborted, 1);
});
