import assert from "node:assert/strict";
import test from "node:test";
import { createWorkerExportHandler } from "../../dist/worker/export.http.js";
import { readWorkerExportUpload } from "../../dist/worker/export-upload.reader.js";
import { McpAuthenticationError } from "../../dist/remote-mcp-auth.js";
import { WORKER_EXPORT_LIMITS } from "@theoryfoundry/contracts";
import { provenance } from "../test-support/worker-export.fixture.mjs";
const metadata = { version: "1", projectId: "project", revisionId: "revision", jobId: "job", exportId: "export", token: "a".repeat(64), sourceHash: "b".repeat(64), format: "stl", outcome: "COMPLETED", provenance };
function upload(value = metadata, bytes = new Uint8Array([1]), extra) {
  const form = new FormData(); form.set("metadata", JSON.stringify(value));
  if (bytes) form.set("artifact", new Blob([bytes]), "untrusted-name.stl");
  extra?.(form);
  return new Request("https://cad.example/v1/worker/exports/complete", { method: "POST", body: form });
}

test("exports authenticate before reading bytes, enforce flags/origin and reauthenticate every operation", async () => {
  let enabled = true, revoked = false, calls = 0;
  const handler = createWorkerExportHandler({ enabled: () => enabled, origin: () => "https://cad.example",
    authenticate: async () => { if (revoked) throw new McpAuthenticationError(401, "invalid_token"); return "owner"; },
    service: owner => ({ complete: async (input, bytes) => { assert.equal(owner, "owner"); assert.deepEqual(input, metadata); assert.equal(bytes.length, 1); calls++; return { state: "COMPLETED" }; } }) });
  assert.equal((await handler(upload(), "complete")).status, 200);
  revoked = true; const denied = upload();
  assert.equal((await handler(denied, "complete")).status, 401); assert.equal(denied.bodyUsed, false);
  enabled = false; assert.equal((await handler(upload(), "complete")).status, 404);
  enabled = true; const foreign = upload(); foreign.headers.set("origin", "https://foreign.example");
  assert.equal((await handler(foreign, "complete")).status, 403); assert.equal(calls, 1);
});

test("multipart accepts strict success/failure shapes and rejects ambiguous, truncated and oversized input", async () => {
  assert.equal((await readWorkerExportUpload(upload())).bytes.length, 1);
  assert.equal((await readWorkerExportUpload(upload({ ...metadata, outcome: "FAILED" }, null))).bytes, undefined);
  for (const request of [upload(metadata, null), upload({ ...metadata, outcome: "FAILED" }), upload({ ...metadata, unexpected: true }), upload(metadata, undefined, form => form.append("metadata", "{}")), upload(metadata, undefined, form => form.append("extra", "bad")), upload(metadata, undefined, form => form.append("artifact", new Blob(["x"])))]) {
    await assert.rejects(readWorkerExportUpload(request), SyntaxError);
  }
  await assert.rejects(readWorkerExportUpload(upload(metadata, new Uint8Array(10 * 1024 ** 2 + 1))), RangeError);
  await assert.rejects(readWorkerExportUpload(upload(metadata, undefined, form => form.set("metadata", " ".repeat(128 * 1024 + 1)))), RangeError);
  const original = upload(), wire = await original.arrayBuffer();
  await assert.rejects(readWorkerExportUpload(new Request(original.url, { method: "POST", headers: original.headers, body: wire.slice(0, -30) })), SyntaxError);
  let cancelled = false;
  const stream = new ReadableStream({ start(c) { c.enqueue(new Uint8Array(WORKER_EXPORT_LIMITS.requestBytes + 1)); }, cancel() { cancelled = true; } });
  await assert.rejects(readWorkerExportUpload(new Request(original.url, { method: "POST", headers: original.headers, body: stream, duplex: "half" })), RangeError);
  assert.equal(cancelled, true);
});

test("slow and aborted uploads release their streams", async () => {
  for (const aborted of [false, true]) {
    let cancelled = false;
    const controller = new AbortController();
    const request = new Request("https://cad.example", { method: "POST", headers: { "content-type": "multipart/form-data; boundary=test" },
      body: new ReadableStream({ cancel() { cancelled = true; } }), duplex: "half", signal: controller.signal });
    const timer = setTimeout(() => { if (aborted) controller.abort(); }, 5);
    // Keep an active timer while AbortSignal.timeout uses an unref'ed timer.
    const keepAlive = setTimeout(() => {}, 1000);
    try { await assert.rejects(readWorkerExportUpload(request, 20), error => ["TimeoutError", "AbortError"].includes(error.name)); assert.equal(cancelled, true); }
    finally { clearTimeout(timer); clearTimeout(keepAlive); }
  }
});
