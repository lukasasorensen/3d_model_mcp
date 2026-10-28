import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { parseBinaryStl, parseThreeMf } from "@theoryfoundry/renderer";
import {
  createLocalWorkerServer,
  createWorkerRenderer,
} from "../dist/index.js";
import { inspectPng } from "../../../tooling/headless-renderer/acceptance/utils/png.util.mjs";
import { hostedFixture, hash } from "./hostedFixture.adapter.mjs";
const renderer = createWorkerRenderer(
  new URL("../dist/assets/", import.meta.url),
);
const hosted = hostedFixture(renderer.provenance);
const worker = createLocalWorkerServer({
  renderer,
  api: hosted.api,
  callHosted: hosted.callHosted,
});
const client = new Client({ name: "local-worker-acceptance", version: "1" });
const [a, b] = InMemoryTransport.createLinkedPair();
const checks = [];
const validation = {
  projectId: "project",
  candidateId: "candidate",
  previewProfile: "standard",
};
async function call(name, args) {
  const result = await client.callTool({ name, arguments: args }, undefined, {
    timeout: 110_000,
  });
  assert.ok(!result.isError, JSON.stringify(result));
  return result;
}
try {
  await worker.server.connect(b);
  await client.connect(a);
  assert.equal((await client.listTools()).tools.length, 11);
  assert.equal(
    (await call("get_project_state", { projectId: "project" }))
      .structuredContent.state.rendererAvailability,
    "ready",
  );
  const valid = (await call("validate_and_render", validation))
    .structuredContent.candidate;
  assert.equal(valid.state, "VALID");
  assert.deepEqual(valid.geometry.dimensions, [30, 20, 10]);
  checks.push(
    "MCP validation uses real sandboxed Chromium and returns fixture-hosted authoritative geometry",
  );
  const pngs = [];
  for (const view of [
    "isometric",
    "front",
    "back",
    "left",
    "right",
    "top",
    "bottom",
  ]) {
    const preview = await call("get_model_preview", {
      projectId: "project",
      candidateId: "candidate",
      view,
    });
    const image = preview.content.find((part) => part.type === "image");
    assert.ok(image);
    const bytes = Buffer.from(image.data, "base64");
    inspectPng(bytes);
    assert.equal(preview.structuredContent.imageHash, hash(bytes));
    pngs.push(hash(bytes));
  }
  assert.ok(new Set(pngs).size >= 4);
  checks.push("Seven decoded 768px PNG views with exact image hashes");
  for (const format of ["stl", "3mf"]) {
    const result = await call("export_model", {
      projectId: "project",
      revision: "revision",
      format,
    });
    assert.equal(
      result.structuredContent.export.hash,
      hash(hosted.artifacts.at(-1).bytes),
    );
  }
  const stl = parseBinaryStl(hosted.artifacts[0].bytes);
  const threeMf = parseThreeMf(hosted.artifacts[1].bytes);
  assert.deepEqual(stl.boundingBox, threeMf.boundingBox);
  assert.equal(stl.triangleCount, threeMf.triangleCount);
  checks.push(
    "STL and 3MF parse to matching geometry and exact upload receipts",
  );
  hosted.setSource(
    "include <BOSL2/std.scad>\ncuboid([12,18,6],rounding=1,$fn=16);",
  );
  assert.equal(
    (await call("validate_and_render", validation)).structuredContent.candidate
      .state,
    "VALID",
  );
  const bosl = await call("get_model_preview", {
    projectId: "project",
    candidateId: "candidate",
  });
  inspectPng(
    Buffer.from(
      bosl.content.find((part) => part.type === "image").data,
      "base64",
    ),
  );
  checks.push("Pinned BOSL2 validation and PNG");
  hosted.setSource("cube([;");
  assert.equal(
    (await call("validate_and_render", validation)).structuredContent.candidate
      .state,
    "REJECTED",
  );
  checks.push("Invalid source remains a model rejection");
  hosted.setSource("sphere(r=10,$fn=1000);");
  const abort = new AbortController();
  const pending = client.callTool(
    { name: "validate_and_render", arguments: validation },
    undefined,
    { signal: abort.signal },
  );
  const rejected = assert.rejects(pending);
  await delay(100);
  abort.abort();
  await rejected;
  for (let count = 0; count < 100 && hosted.cancellations === 0; count++)
    await delay(50);
  assert.equal(hosted.cancellations, 1);
  hosted.setSource("cube([3,4,5]);");
  assert.equal(
    (await call("validate_and_render", validation)).structuredContent.candidate
      .state,
    "VALID",
  );
  checks.push(
    "MCP cancellation closes Chromium, releases its lease, and the next render succeeds",
  );
} finally {
  await worker.close();
  await client.close();
}
assert.equal(renderer.available(), false);
for (
  let count = 0;
  count < 20 && process.getActiveResourcesInfo().includes("TCPServerWrap");
  count++
)
  await delay(10);
assert.ok(!process.getActiveResourcesInfo().includes("TCPServerWrap"));
checks.push("Shutdown releases the loopback listener and Chromium runtime");
console.log(
  JSON.stringify(
    {
      platform: process.platform,
      architecture: process.arch,
      node: process.version,
      provenance: renderer.provenance,
      checks,
    },
    null,
    2,
  ),
);
