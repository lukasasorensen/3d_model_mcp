import assert from "node:assert/strict";
import test from "node:test";
import { AIMessage, HumanMessage, ToolMessage } from "@langchain/core/messages";
import {
  createConnectionModel,
  testConnectionProvider,
} from "../../../../dist/index.js";

const token = "fixture-owned-api-token";
const call = {
  id: "check-1",
  name: "connection_check",
  args: { code: "ready" },
};
const responses = {
  openai: {
    id: "fixture",
    object: "chat.completion",
    model: "fixture",
    choices: [
      {
        index: 0,
        message: {
          role: "assistant",
          content: "",
          tool_calls: [
            {
              id: call.id,
              type: "function",
              function: {
                name: call.name,
                arguments: JSON.stringify(call.args),
              },
            },
          ],
        },
        finish_reason: "tool_calls",
      },
    ],
    usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
  },
  anthropic: {
    id: "fixture",
    type: "message",
    role: "assistant",
    model: "fixture",
    content: [
      { type: "tool_use", id: call.id, name: call.name, input: call.args },
    ],
    stop_reason: "tool_use",
    usage: { input_tokens: 10, output_tokens: 5 },
  },
  google: {
    candidates: [
      {
        content: {
          role: "model",
          parts: [{ functionCall: { name: call.name, args: call.args } }],
        },
        finishReason: "STOP",
      },
    ],
    usageMetadata: {
      promptTokenCount: 10,
      candidatesTokenCount: 5,
      totalTokenCount: 15,
    },
  },
};
for (const provider of ["openai", "anthropic", "google", "openai-compatible"]) {
  test(`${provider} authenticates explicitly and normalizes synthetic tool calls`, async () => {
    let calls = 0;
    await testConnectionProvider(
      {
        provider,
        model: "fixture",
        token,
        ...(provider === "openai-compatible"
          ? { endpoint: "https://compatible.test/v1" }
          : {}),
        fetch: async (input, init) => {
          const request = new Request(input, init);
          const headers = request.headers;
          assert.ok(
            [
              headers.get("authorization"),
              headers.get("x-api-key"),
              headers.get("x-goog-api-key"),
            ].some((value) => value?.includes(token)),
          );
          const body = await request.json();
          assert.ok(JSON.stringify(body).includes("connection_check"));
          assert.ok(!JSON.stringify(body).includes(token));
          calls++;
          return Response.json(
            responses[provider === "openai-compatible" ? "openai" : provider],
          );
        },
      },
      new AbortController().signal,
    );
    assert.equal(calls, 1);
  });
}
test("saved connections never fall back to environment credentials", () => {
  const prior = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = "environment-token";
  try {
    assert.throws(
      () => createConnectionModel({ provider: "openai", model: "fixture" }),
      { code: "AI_CONFIGURATION" },
    );
  } finally {
    if (prior === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = prior;
  }
});
test("authentication and unsupported tool calls produce sanitized errors", async () => {
  for (const status of [401, 429, 404])
    await assert.rejects(
      testConnectionProvider(
        {
          provider: "openai",
          model: "fixture",
          token,
          fetch: async () =>
            Response.json({ error: { message: token } }, { status }),
        },
        new AbortController().signal,
      ),
      (error) =>
        !error.message.includes(token) &&
        error.code ===
          {
            401: "AI_AUTHENTICATION",
            429: "AI_QUOTA",
            404: "AI_MODEL_UNSUPPORTED",
          }[status],
    );
  await assert.rejects(
    testConnectionProvider(
      {
        provider: "openai",
        model: "fixture",
        token,
        fetch: async () =>
          Response.json({
            ...responses.openai,
            choices: [
              {
                index: 0,
                message: { role: "assistant", content: "No tools." },
                finish_reason: "stop",
              },
            ],
          }),
      },
      new AbortController().signal,
    ),
    { code: "AI_MODEL_UNSUPPORTED" },
  );
});
test("the companion adapter preserves tool-call IDs and passes cancellation", async () => {
  const abort = new AbortController();
  let captured;
  const model = createConnectionModel({
    provider: "ollama",
    model: "local",
    invoke: async (input, signal) => {
      captured = input;
      assert.ok(signal);
      return { content: "done", toolCalls: [] };
    },
  });
  const result = await model.bindTools([]).invoke(
    [
      new HumanMessage("Revise the model"),
      new AIMessage({
        content: "",
        tool_calls: [{ ...call, type: "tool_call" }],
      }),
      new ToolMessage({ content: "ready", tool_call_id: call.id }),
    ],
    { signal: abort.signal },
  );
  assert.equal(result.content, "done");
  assert.equal(captured.messages[1].toolCalls[0].id, call.id);
  assert.equal(captured.messages[2].toolCallId, call.id);
});
