import assert from "node:assert/strict";
import test from "node:test";
import { parseChatStream, StreamProtocolError } from "./lib/stream-client";

const encoder = new TextEncoder();
const base = { version: "3", requestId: "request-1", sessionId: "session-1", timestamp: "2026-08-05T00:00:00.000Z" };

function body(events: readonly unknown[]): ReadableStream<Uint8Array> {
  return new ReadableStream({ start(controller) { controller.enqueue(encoder.encode(events.map((value) => typeof value === "string" ? value : JSON.stringify(value)).join("\n") + "\n")); controller.close(); } });
}

async function collect(stream: ReadableStream<Uint8Array>) { const values = []; for await (const value of parseChatStream(stream, "session-1")) values.push(value); return values; }

test("parser accepts a strictly monotonic terminal stream", async () => {
  const values = await collect(body([{ ...base, sequence: 0, type: "assistant_delta", delta: "Ready" }, { ...base, sequence: 1, type: "done", outcome: "completed", toolRounds: 0 }]));
  assert.deepEqual(values.map((value) => value.type), ["assistant_delta", "done"]);
});

for (const [name, events] of [
  ["duplicate", [{ ...base, sequence: 0, type: "assistant_delta", delta: "a" }, { ...base, sequence: 0, type: "done", outcome: "completed", toolRounds: 0 }]],
  ["gap", [{ ...base, sequence: 1, type: "done", outcome: "completed", toolRounds: 0 }]],
  ["session mismatch", [{ ...base, sessionId: "session-2", sequence: 0, type: "done", outcome: "completed", toolRounds: 0 }]],
  ["event after done", [{ ...base, sequence: 0, type: "done", outcome: "completed", toolRounds: 0 }, { ...base, sequence: 1, type: "assistant_delta", delta: "late" }]],
  ["missing terminal", [{ ...base, sequence: 0, type: "assistant_delta", delta: "a" }]],
] as const) test(`parser rejects ${name}`, async () => { await assert.rejects(() => collect(body(events)), StreamProtocolError); });

test("parser rejects malformed NDJSON", async () => { await assert.rejects(() => collect(body(["{not-json"])), StreamProtocolError); });
