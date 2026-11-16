import assert from "node:assert/strict";
import test from "node:test";
import { waitForParameterRefresh } from "../../../../../src/features/parameter-controls/browser/utils/parameterRefresh.util";

void test("refresh waits time out, accept cancellation and ignore late completion", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let complete: (value: boolean) => void = () => undefined;
  const stalled = (): Promise<boolean> =>
    new Promise((resolve) => {
      complete = resolve;
    });
  const controller = new AbortController();
  const timed = waitForParameterRefresh(stalled, controller.signal);
  await Promise.resolve();
  t.mock.timers.tick(15_000);
  assert.equal(await timed, false);
  complete(true);
  assert.equal(await timed, false);

  const cancelled = waitForParameterRefresh(stalled, controller.signal);
  await Promise.resolve();
  controller.abort();
  assert.equal(await cancelled, false);
  complete(true);
  assert.equal(await cancelled, false);
  assert.equal(
    await waitForParameterRefresh(
      () => assert.fail("aborted"),
      controller.signal,
    ),
    false,
  );
});

void test("refresh preserves false results and safely handles synchronous and async failures", async () => {
  const signal = new AbortController().signal;
  assert.equal(await waitForParameterRefresh(async () => true, signal), true);
  assert.equal(await waitForParameterRefresh(async () => false, signal), false);
  assert.equal(
    await waitForParameterRefresh(() => {
      throw new Error("failed");
    }, signal),
    false,
  );
  assert.equal(
    await waitForParameterRefresh(async () => {
      throw new Error("failed");
    }, signal),
    false,
  );
});
