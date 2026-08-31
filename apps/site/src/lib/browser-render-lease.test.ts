import assert from "node:assert/strict";
import test from "node:test";
import { BrowserRenderLease } from "./browser-render-lease";

test("a user submit during a claim poll waits instead of being silently dropped", async () => {
  const lease = new BrowserRenderLease();
  assert.equal(lease.tryBackground(), true);
  const submit = lease.acquireForeground();
  assert.equal(lease.tryBackground(), false);
  assert.equal(await lease.acquireForeground(), false);
  lease.release();
  assert.equal(await submit, true);
  assert.equal(lease.tryBackground(), false);
  assert.equal(await lease.acquireForeground(), false);
  lease.release();
  assert.equal(lease.tryBackground(), true);
  lease.release();
});
