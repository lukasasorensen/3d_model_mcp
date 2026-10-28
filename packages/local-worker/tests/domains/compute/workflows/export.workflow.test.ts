import test from "node:test";
import assert from "node:assert/strict";
import { exportLocally } from "../../../../src/domains/compute/index.js";
import {
  fixture,
  exportInput,
  signal,
} from "../../../fixtures/compute.fixture.js";
for (const format of ["stl", "3mf"] as const)
  void test(`${format} uploads the local bytes and returns the hosted receipt`, async () => {
    const f = fixture();
    f.exportLease.format = format;
    f.receipt.format = format;
    f.receipt.mimeType = format === "stl" ? "model/stl" : "model/3mf";
    const upload = f.deps.api.upload;
    f.deps.api.upload = async (body, bytes, active): Promise<unknown> => {
      assert.deepEqual(Buffer.from(bytes), f.bytes);
      assert.equal(body.format, format);
      return upload(body, bytes, active);
    };
    const result = await exportLocally(
      { ...exportInput, format },
      f.deps,
      signal(),
    );
    assert.deepEqual(result.export, f.receipt);
    assert.equal(f.calls.at(-1)!.path, "exports/complete");
  });
void test("reused export does not launch a local renderer", async () => {
  const f = fixture();
  const {
    downloadUrl: _url,
    downloadExpiresAt: _expiry,
    ...metadata
  } = f.receipt;
  void _url;
  void _expiry;
  f.deps.api.json = async (): Promise<unknown> => ({
    version: "1",
    state: "COMPLETED",
    reused: true,
    metadata,
    receipt: f.receipt,
  });
  f.deps.renderer.render = async (): ReturnType<
    typeof f.deps.renderer.render
  > => {
    assert.fail("no render for reuse");
  };
  assert.deepEqual(
    (await exportLocally(exportInput, f.deps, signal())).export,
    f.receipt,
  );
});
void test("export rejects mismatched renderer provenance and cancels its lease", async () => {
  const f = fixture();
  f.exportLease.renderer = {
    ...f.exportLease.renderer,
    validationPolicyVersion: "wrong-policy",
  };
  await assert.rejects(
    exportLocally(exportInput, f.deps, signal()),
    /different renderer/,
  );
  assert.equal(f.calls.at(-1)!.path, "exports/cancel");
});
void test("export checks the server receipt against the exact uploaded bytes", async () => {
  const f = fixture();
  f.receipt.hash = "0".repeat(64);
  await assert.rejects(
    exportLocally(exportInput, f.deps, signal()),
    /does not match/,
  );
});
void test("lost upload response recovers the authoritative receipt", async () => {
  const f = fixture();
  f.deps.api.upload = async (): Promise<unknown> => {
    throw new Error("network lost");
  };
  assert.deepEqual(
    (await exportLocally(exportInput, f.deps, signal())).export,
    f.receipt,
  );
  assert.equal(f.calls.at(-1)!.path, "exports/status");
});
void test("cancelled export does not upload and releases the lease", async () => {
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
  await assert.rejects(exportLocally(exportInput, f.deps, abort.signal), {
    name: "AbortError",
  });
  assert.equal(f.calls.at(-1)!.path, "exports/cancel");
  assert.equal(f.calls.at(-1)!.signal.aborted, false);
});
