import assert from "node:assert/strict";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { createLocalAiModels } from "../../../dist/infrastructure/ai/index.js";

for (const provider of ["ollama", "openai-compatible"]) {
  test(`${provider} discovers local models and normalizes structured calls`, async () => {
    const endpoint =
      provider === "ollama"
        ? "http://127.0.0.1:11434"
        : "http://127.0.0.1:1234/v1";
    const models = createLocalAiModels(
      { provider, endpoint, token: "local-token" },
      async (input, init) => {
        const request = new Request(input, init);
        assert.equal(
          request.headers.get("authorization"),
          "Bearer local-token",
        );
        if (request.url.endsWith("/models"))
          return Response.json({ data: [{ id: "fixture" }] });
        if (request.url.endsWith("/api/tags"))
          return Response.json({ models: [{ name: "fixture" }] });
        const body = await request.json();
        assert.ok(JSON.stringify(body).includes("connection_check"));
        return provider === "ollama"
          ? new Response(
              JSON.stringify({
                model: "fixture",
                created_at: new Date().toISOString(),
                done: true,
                done_reason: "stop",
                message: {
                  role: "assistant",
                  content: "",
                  tool_calls: [
                    {
                      function: {
                        name: "connection_check",
                        arguments: { code: "ready" },
                      },
                    },
                  ],
                },
              }) + "\n",
            )
          : Response.json({
              id: "fixture",
              choices: [
                {
                  index: 0,
                  message: {
                    role: "assistant",
                    content: "",
                    tool_calls: [
                      {
                        id: "check",
                        type: "function",
                        function: {
                          name: "connection_check",
                          arguments: '{"code":"ready"}',
                        },
                      },
                    ],
                  },
                  finish_reason: "tool_calls",
                },
              ],
            });
      },
    );
    assert.deepEqual(
      await models.execute(
        { operation: "models" },
        new AbortController().signal,
      ),
      { models: ["fixture"] },
    );
    const output = await models.execute(
      {
        operation: "invoke",
        model: "fixture",
        messages: [{ role: "user", content: "Check" }],
        tools: [
          {
            name: "connection_check",
            description: "Check",
            parameters: {
              type: "object",
              properties: { code: { type: "string" } },
              required: ["code"],
            },
          },
        ],
      },
      new AbortController().signal,
    );
    assert.ok("result" in output, JSON.stringify(output));
    assert.equal(output.result.toolCalls[0].name, "connection_check");
    assert.deepEqual(output.result.toolCalls[0].args, { code: "ready" });
  });
}
test("AI help starts without renderer assets or Chromium initialization", () => {
  const result = spawnSync(
    process.execPath,
    ["dist/workerCli.composition.js", "ai", "--help"],
    {
      cwd: new URL("../../../", import.meta.url),
      encoding: "utf8",
      env: {
        ...process.env,
        PLAYWRIGHT_BROWSERS_PATH: "/missing-ai-test-browser",
      },
    },
  );
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /ai serve\|doctor/);
  assert.doesNotMatch(result.stderr, /Chromium|renderer/);
});

const input = {
  operation: "invoke",
  model: "fixture",
  messages: [{ role: "user", content: "check" }],
  tools: [],
};
const finished = () =>
  new Response(
    JSON.stringify({
      model: "fixture",
      done: true,
      message: { role: "assistant", content: "ready" },
    }) + "\n",
  );

test("Ollama cancellation aborts a request before headers and leaves later jobs usable", async (t) => {
  let requests = 0;
  let outbound;
  let ready;
  const started = new Promise((resolve) => {
    ready = resolve;
  });
  const adapter = createLocalAiModels(
    { provider: "ollama", endpoint: "http://127.0.0.1:11434" },
    async (url, options) => {
      requests++;
      if (requests > 1) return finished();
      outbound = new Request(url, options);
      return new Promise((_resolve, reject) => {
        const watchdog = setTimeout(
          () => reject(new Error("HTTP request was not cancelled")),
          500,
        );
        t.after(() => clearTimeout(watchdog));
        outbound.signal.addEventListener(
          "abort",
          () => {
            clearTimeout(watchdog);
            reject(outbound.signal.reason);
          },
          { once: true },
        );
        ready();
      });
    },
  );
  const abort = new AbortController();
  const pending = adapter.execute(input, abort.signal);
  await started;
  abort.abort();
  assert.deepEqual(await pending, { error: "AI_TIMEOUT" });
  assert.equal(outbound.signal.aborted, true);
  const next = await adapter.execute(input, new AbortController().signal);
  assert.equal(next.result.content, "ready");
});

test("Ollama cancellation aborts a stalled response body without waiting for a chunk", async (t) => {
  let ready;
  let outbound;
  const started = new Promise((resolve) => {
    ready = resolve;
  });
  const adapter = createLocalAiModels(
    { provider: "ollama", endpoint: "http://127.0.0.1:11434" },
    async (url, options) => {
      outbound = new Request(url, options);
      return new Response(
        new ReadableStream({
          start(controller) {
            const watchdog = setTimeout(
              () => controller.error(new Error("HTTP body was not cancelled")),
              500,
            );
            t.after(() => clearTimeout(watchdog));
            outbound.signal.addEventListener(
              "abort",
              () => {
                clearTimeout(watchdog);
                controller.error(outbound.signal.reason);
              },
              { once: true },
            );
            ready();
          },
        }),
      );
    },
  );
  const abort = new AbortController();
  const pending = adapter.execute(input, abort.signal);
  await started;
  abort.abort();
  assert.deepEqual(await pending, { error: "AI_TIMEOUT" });
  assert.equal(outbound.signal.aborted, true);
});
