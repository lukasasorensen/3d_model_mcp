import assert from "node:assert/strict";
import test from "node:test";
import { renderOpenScad } from "./browser-renderer";

test("an already-cancelled preview cannot start a new OpenSCAD worker", async () => {
  const previous = globalThis.Worker; let created = 0;
  globalThis.Worker = class { constructor() { created++; throw new Error("Worker must not start"); } } as unknown as typeof Worker;
  try {
    const controller = new AbortController(); controller.abort();
    await assert.rejects(renderOpenScad("cube(10);", "stl", controller.signal), { name: "AbortError" });
    assert.equal(created, 0);
  } finally { globalThis.Worker = previous; }
});

test("cancelling an in-flight OpenSCAD render terminates its worker", async () => {
  const previousWorker = globalThis.Worker; const previousWindow = globalThis.window;
  let terminated = 0;
  globalThis.Worker = class { postMessage() {} terminate() { terminated++; } } as unknown as typeof Worker;
  globalThis.window = { setTimeout, clearTimeout, location: { origin: "http://localhost:3000" } } as unknown as Window & typeof globalThis;
  try {
    const controller = new AbortController();
    const rendering = renderOpenScad("cube(10);", "stl", controller.signal);
    controller.abort();
    await assert.rejects(rendering, { name: "AbortError" });
    assert.equal(terminated, 1);
  } finally { globalThis.Worker = previousWorker; globalThis.window = previousWindow; }
});
