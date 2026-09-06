import assert from "node:assert/strict";
import test from "node:test";
import { ActivePreview } from "./active-preview";
import { BrowserRenderLease } from "./browser-render-lease";
const tick = () => new Promise<void>((resolve) => setImmediate(resolve));

test("cancellation invalidation aborts rendering and releases a waiting foreground action", async () => {
  const lease = new BrowserRenderLease(); assert.equal(lease.tryBackground(), true);
  let state: "pending" | "cancelled" = "pending"; let reads = 0;
  const active = new ActivePreview(new AbortController().signal, async () => { reads++; return state; });
  const rendering = new Promise<void>((resolve) => active.signal.addEventListener("abort", () => resolve(), { once: true })).finally(() => lease.release());
  active.invalidate(); await tick(); assert.equal(reads, 1);
  await tick(); assert.equal(reads, 1, "Idle rendering must not poll");
  const foreground = lease.acquireForeground(); state = "cancelled"; active.invalidate();
  await rendering; assert.equal(await foreground, true); assert.equal(active.signal.aborted, true); lease.release();
});

test("invalidation during a status read schedules a trailing read", async () => {
  let finish: (state: "pending") => void = () => undefined; let reads = 0;
  const active = new ActivePreview(new AbortController().signal, async () => {
    reads++; if (reads === 1) return new Promise<"pending">((resolve) => { finish = resolve; });
    return "cancelled";
  });
  active.invalidate(); active.invalidate(); finish("pending"); await tick();
  assert.equal(reads, 2); assert.equal(active.signal.aborted, true);
});

test("late cancellation reads do not abort a finished render during normal delivery", async () => {
  let finish: (state: "cancelled") => void = () => undefined;
  const active = new ActivePreview(new AbortController().signal, () => new Promise((resolve) => { finish = resolve; }));
  active.invalidate(); active.close(); finish("cancelled"); await tick();
  assert.equal(active.signal.aborted, false);
});

test("lifecycle cancellation reaches the worker and failed status reads fail closed", async () => {
  const lifecycle = new AbortController();
  const active = new ActivePreview(lifecycle.signal, async () => "pending"); lifecycle.abort();
  assert.equal(active.signal.aborted, true); active.close();
  const failed = new ActivePreview(new AbortController().signal, async () => { throw new Error("offline"); });
  failed.invalidate(); await tick(); assert.equal(failed.signal.aborted, true); failed.close();
});
