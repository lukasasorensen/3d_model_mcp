import test from "node:test";
import assert from "node:assert/strict";
import { validateLocally } from "../../../../src/domains/compute/index.js";
import {
  fixture,
  validationInput,
  signal,
} from "../../../fixtures/compute.fixture.js";
void test("validation returns the hosted candidate and submits geometry without promoting", async () => {
  const f = fixture();
  const result = await validateLocally(validationInput, f.deps, signal());
  assert.deepEqual(result.candidate, f.candidate);
  assert.deepEqual(
    f.calls.map((call) => call.path),
    ["validation/begin", "validation/complete"],
  );
  assert.equal(
    (f.calls[1]!.body as { result: { outcome: string } }).result.outcome,
    "VALID",
  );
});
for (const outcome of ["model", "operational"] as const)
  void test(`validation distinguishes ${outcome} failures`, async () => {
    const f = fixture();
    f.setRender({
      ok: false,
      name: "Error",
      message: "fixture",
      failureKind: outcome,
      diagnostics: [],
    });
    f.candidate.state = outcome === "model" ? "REJECTED" : "CREATED";
    if (outcome === "model")
      assert.equal(
        (await validateLocally(validationInput, f.deps, signal())).candidate
          .state,
        "REJECTED",
      );
    else
      await assert.rejects(
        validateLocally(validationInput, f.deps, signal()),
        /retry the same candidate/,
      );
    assert.equal(
      (f.calls[1]!.body as { result: { outcome: string } }).result.outcome,
      outcome === "model" ? "REJECTED" : "FAILED",
    );
    assert.equal(f.calls.length, 2);
  });
void test("tampered source cancels the lease before rendering", async () => {
  const f = fixture();
  f.lease.source += "sphere(1);";
  f.deps.renderer.render = async (): ReturnType<
    typeof f.deps.renderer.render
  > => {
    assert.fail("must not render");
  };
  await assert.rejects(
    validateLocally(validationInput, f.deps, signal()),
    /integrity/,
  );
  assert.equal(f.calls.at(-1)!.path, "validation/cancel");
});
void test("cancellation uses a fresh bounded cleanup signal", async () => {
  const f = fixture();
  const abort = new AbortController();
  f.deps.renderer.render = async (
    _input,
    active,
  ): ReturnType<typeof f.deps.renderer.render> => {
    abort.abort();
    active.throwIfAborted();
    throw new Error("unreachable");
  };
  await assert.rejects(validateLocally(validationInput, f.deps, abort.signal), {
    name: "AbortError",
  });
  const cleanup = f.calls.at(-1)!;
  assert.equal(cleanup.path, "validation/cancel");
  assert.equal(cleanup.signal.aborted, false);
});
void test("lost completion response resolves from status without starting another lease", async () => {
  const f = fixture();
  const json = f.deps.api.json;
  f.deps.api.json = async (path, body, active): Promise<unknown> => {
    if (path === "validation/complete") throw new Error("lost response");
    return json(path, body, active);
  };
  assert.equal(
    (await validateLocally(validationInput, f.deps, signal())).candidate.state,
    "VALID",
  );
  assert.deepEqual(
    f.calls.map((call) => call.path),
    ["validation/begin", "validation/status"],
  );
});
void test("a mismatched hosted completion cannot become local success", async () => {
  const f = fixture();
  f.candidate.projectId = "other";
  await assert.rejects(
    validateLocally(validationInput, f.deps, signal()),
    /does not match/,
  );
  assert.equal(f.calls.at(-1)!.path, "validation/cancel");
});
