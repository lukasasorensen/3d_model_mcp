import assert from "node:assert/strict";
import test from "node:test";
import { waitForRenderOutcome } from "../dist/render-outcome-wait.js";

function source() {
  const listeners = new Set();
  return { listeners, async subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); }, emit(event = null) { for (const listener of listeners) listener(event); } };
}

test("render waits retain completion notifications arriving during a read and clean up", async () => {
  const changes = source();
  let reads = 0;
  const result = await waitForRenderOutcome({ changes, ownerId: "owner", jobId: "job", read: async () => {
    reads++;
    if (reads === 1) { changes.emit({ ownerId: "owner", jobId: "job", kind: "render", projectId: "project" }); return { deadline: Date.now() + 60_000 }; }
    return { result: "done", deadline: 0 };
  } });
  assert.equal(result, "done"); assert.equal(reads, 2); assert.equal(changes.listeners.size, 0);
});

test("render waits stay idle, ignore other owners, and resync after a listener gap", async () => {
  const changes = source();
  let reads = 0;
  let complete = false;
  const result = waitForRenderOutcome({ changes, ownerId: "owner", jobId: "job", read: async () => {
    reads++; return { result: complete ? "done" : undefined, deadline: Date.now() + 60_000 };
  } });
  await new Promise((resolve) => setTimeout(resolve, 20));
  changes.emit({ kind: "render", ownerId: "other", jobId: "job", projectId: "project" });
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(reads, 1);
  complete = true; changes.emit();
  assert.equal(await result, "done"); assert.equal(reads, 2);
});

test("render deadline and abort wake without a database notification", async () => {
  const changes = source();
  let reads = 0;
  assert.equal(await waitForRenderOutcome({ changes, ownerId: "owner", jobId: "job", read: async () => {
    reads++; return { result: reads === 2 ? "expired" : undefined, deadline: Date.now() + 10 };
  } }), "expired");
  const abort = new AbortController();
  const result = waitForRenderOutcome({ changes, ownerId: "owner", jobId: "job", signal: abort.signal, read: async () => ({ deadline: Date.now() + 60_000 }) });
  abort.abort(); await assert.rejects(result, { name: "AbortError" }); assert.equal(changes.listeners.size, 0);
});
