import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { serveAiCompanion } from "../../../../dist/features/ai/index.js";

test("completion retries do not repeat local inference", async () => {
  const stop = new AbortController();
  let invocations = 0;
  let completions = 0;
  const device = { id: randomUUID(), name: "Computer", provider: "ollama" };
  const job = {
    id: randomUUID(),
    lease: "a".repeat(64),
    deadline: new Date(Date.now() + 30_000).toISOString(),
    input: { operation: "models" },
  };
  const api = {
    async send(action, body) {
      if (action === "claim") return { job };
      if (action === "complete") {
        assert.equal(body.companionId, device.id);
        assert.equal(body.jobId, job.id);
        completions++;
        if (completions === 1) throw new Error("Transient transport failure");
        stop.abort();
      }
      return { ok: true };
    },
  };
  await serveAiCompanion(
    device,
    api,
    {
      async execute() {
        invocations++;
        return { models: ["local"] };
      },
    },
    stop.signal,
    () => {},
  );
  assert.equal(invocations, 1);
  assert.equal(completions, 2);
});
test("a leased job deadline cancels inference and prevents uploading a late result", async () => {
  const stop = new AbortController();
  let completed = false;
  let aborted = false;
  const job = {
    id: randomUUID(),
    lease: "b".repeat(64),
    deadline: new Date(Date.now() + 100).toISOString(),
    input: { operation: "models" },
  };
  await serveAiCompanion(
    { id: randomUUID(), name: "Computer", provider: "ollama" },
    {
      async send(action) {
        if (action === "claim") return { job };
        if (action === "complete") completed = true;
        return { ok: true };
      },
    },
    {
      async execute(_input, signal) {
        await new Promise((resolve) =>
          signal.addEventListener("abort", resolve, { once: true }),
        );
        aborted = true;
        stop.abort();
        return { models: ["late-result"] };
      },
    },
    stop.signal,
    () => {},
  );
  assert.equal(aborted, true);
  assert.equal(completed, false);
});
