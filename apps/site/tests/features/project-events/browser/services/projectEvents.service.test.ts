import assert from "node:assert/strict";
import test from "node:test";
import { receiveProjectEvents } from "../../../../../src/features/project-events/browser/services/projectEvents.service";

void test("SSE client parses split frames and acknowledges heartbeats without job invalidations", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async (): Promise<Response> =>
    new Response(
      new ReadableStream({
        start(controller): void {
          for (const part of [
            ': heartbeat\n\ndata: {"type":',
            '"ready"}\n',
            '\ndata: {"type":"project-updated"}\n\n',
          ])
            controller.enqueue(new TextEncoder().encode(part));
          controller.close();
        },
      }),
    );
  try {
    const received: string[] = [];
    let heartbeats = 0;
    assert.equal(
      await receiveProjectEvents(
        "project",
        new AbortController().signal,
        (event) => received.push(event.type),
        () => {
          heartbeats++;
        },
      ),
      true,
    );
    assert.deepEqual(received, ["ready", "project-updated"]);
    assert.equal(heartbeats, 1);
  } finally {
    globalThis.fetch = original;
  }
});

void test("SSE client stops retries on authentication failures", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async (): Promise<Response> =>
    new Response(null, { status: 401 });
  try {
    assert.equal(
      await receiveProjectEvents("project", new AbortController().signal, () =>
        assert.fail(),
      ),
      false,
    );
  } finally {
    globalThis.fetch = original;
  }
});
