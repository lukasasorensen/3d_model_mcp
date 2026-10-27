import assert from "node:assert/strict";
import test from "node:test";
import { createRenderingWorkflow } from "../../../../dist/features/rendering/workflows/rendering.workflow.js";

function fixture(overrides = {}) {
  const calls = [];
  const cached = new Map();
  const bytes = new Uint8Array([1, 2, 3]);
  const workflow = createRenderingWorkflow({
    async renderOpenScad(source, format, signal) {
      calls.push(["compile", source, format, signal]);
      return { bytes, diagnostics: [] };
    },
    async renderPng(mesh, view) {
      calls.push(["png", mesh, view]);
      return "png";
    },
    async encodeDownload(mesh, format) {
      calls.push(["download", mesh, format]);
      return { bytes: mesh, mimeType: "test", extension: format };
    },
    cache: {
      get: (hash) => cached.get(hash),
      set: (hash, mesh) => cached.set(hash, mesh),
    },
    ...overrides,
  });
  return { workflow, calls, bytes };
}
const source = "cube(1);";
async function job() {
  const hash = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(source),
  );
  return { source, sourceHash: Buffer.from(hash).toString("hex"), view: "top" };
}

test("PNG orchestration validates the source binding before compilation and reuses the mesh cache", async () => {
  const { workflow, calls, bytes } = fixture();
  const input = await job();
  const signal = new AbortController().signal;
  await assert.rejects(
    workflow.renderModelPng({ ...input, sourceHash: "bad" }, signal),
    /source hash mismatch/,
  );
  assert.deepEqual(calls, []);
  assert.equal(await workflow.renderModelPng(input, signal), "png");
  assert.equal(await workflow.renderModelPng(input, signal), "png");
  assert.deepEqual(
    calls.map((call) => call[0]),
    ["compile", "png", "png"],
  );
  assert.equal(workflow.cachedPreview(input.sourceHash), bytes);
});

test("download orchestration selects the source format and propagates compilation and encoder failures", async () => {
  const { workflow, calls } = fixture();
  for (const format of ["stl", "3mf", "glb"])
    await workflow.generateDownload(source, format);
  assert.deepEqual(
    calls.filter((call) => call[0] === "compile").map((call) => call[2]),
    ["stl", "3mf", "stl"],
  );
  assert.deepEqual(
    calls.filter((call) => call[0] === "download").map((call) => call[2]),
    ["stl", "3mf", "glb"],
  );
  const failure = new Error("compile unavailable");
  const failed = fixture({
    async renderOpenScad() {
      throw failure;
    },
  });
  await assert.rejects(
    failed.workflow.generateDownload(source, "3mf"),
    (error) => error === failure,
  );
  assert.deepEqual(failed.calls, []);
  const encoderFailure = new Error("encoding unavailable");
  const encoder = fixture({
    async encodeDownload() {
      throw encoderFailure;
    },
  });
  await assert.rejects(
    encoder.workflow.generateDownload(source, "glb"),
    (error) => error === encoderFailure,
  );
});

test("PNG cancellation and presentation failures remain visible to the caller", async () => {
  const failure = new Error("WebGL unavailable");
  const { workflow, calls } = fixture({
    async renderPng() {
      throw failure;
    },
  });
  const input = await job();
  await assert.rejects(workflow.renderModelPng(input, AbortSignal.abort()), {
    name: "AbortError",
  });
  assert.deepEqual(calls, []);
  await assert.rejects(
    workflow.renderModelPng(input, new AbortController().signal),
    (error) => error === failure,
  );
});
