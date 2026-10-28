import test from "node:test";
import assert from "node:assert/strict";
import { WorkQueue } from "../../../../src/features/operations/index.js";
const signal = (): AbortSignal => new AbortController().signal;
void test("queue serializes operations, bounds pending work and drops cancelled work before admission", async () => {
  const queue = new WorkQueue();
  let release!: () => void;
  const started: number[] = [];
  const first = queue.run(async () => {
    started.push(1);
    await new Promise<void>((resolve) => {
      release = resolve;
    });
  }, signal());
  await Promise.resolve();
  const abort = new AbortController();
  const cancelled = queue.run(async () => {
    started.push(99);
  }, abort.signal);
  const rejected = assert.rejects(cancelled, { name: "AbortError" });
  abort.abort();
  await rejected;
  const waiting = [2, 3, 4, 5].map((id) =>
    queue.run(async () => {
      started.push(id);
    }, signal()),
  );
  await assert.rejects(
    queue.run(async () => undefined, signal()),
    /queue is full/,
  );
  assert.deepEqual(started, [1]);
  release();
  await Promise.all([first, ...waiting]);
  assert.deepEqual(started, [1, 2, 3, 4, 5]);
  await queue.close();
});
void test("close aborts admitted work and waits for its cleanup", async () => {
  const queue = new WorkQueue();
  let cleaned = false;
  const work = queue.run(async (active) => {
    await new Promise<void>((resolve) =>
      active.addEventListener(
        "abort",
        () => {
          cleaned = true;
          resolve();
        },
        { once: true },
      ),
    );
  }, signal());
  await Promise.resolve();
  await queue.close();
  await work;
  assert.equal(cleaned, true);
  assert.throws(() => queue.run(async () => undefined, signal()), {
    name: "AbortError",
  });
});
