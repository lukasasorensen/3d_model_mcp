import assert from "node:assert/strict";
import test from "node:test";
import { receiveProjectEvents } from "./project-event-client";

test("SSE client parses split frames and ignores heartbeats", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => new Response(new ReadableStream({ start(controller) {
    for (const part of [': heartbeat\n\ndata: {"type":', '"ready"}\n', '\ndata: {"type":"project-updated"}\n\n']) controller.enqueue(new TextEncoder().encode(part));
    controller.close();
  } }));
  try {
    const received: string[] = [];
    assert.equal(await receiveProjectEvents("project", new AbortController().signal, (event) => received.push(event.type)), true);
    assert.deepEqual(received, ["ready", "project-updated"]);
  } finally { globalThis.fetch = original; }
});

test("SSE client stops retries on authentication failures", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => new Response(null, { status: 401 });
  try { assert.equal(await receiveProjectEvents("project", new AbortController().signal, () => assert.fail()), false); }
  finally { globalThis.fetch = original; }
});
