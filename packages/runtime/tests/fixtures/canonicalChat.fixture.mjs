import { CHAT_LIMITS, chatEventSchema } from "@theoryfoundry/contracts";
import { streamCadChat } from "@theoryfoundry/gateway";
import assert from "node:assert/strict";
export async function chat(
  client,
  projectId,
  sessionId,
  message,
  ids,
  evidence,
) {
  const events = [];
  const started = performance.now();
  for await (const event of streamCadChat(
    { version: "3", projectId, sessionId, message },
    {
      client,
      createId: () => ids.shift(),
      clock: () => new Date("2026-08-06T06:00:00.000Z"),
      createObservabilitySink: () => evidence,
    },
  )) {
    events.push(chatEventSchema.parse(event));
  }
  assert.ok(performance.now() - started < CHAT_LIMITS.requestTimeoutMs);
  return events;
}
