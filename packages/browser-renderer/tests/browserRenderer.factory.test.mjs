import assert from "node:assert/strict";
import test from "node:test";
import {
  createBrowserCadRenderer,
  installOpenScadWorker,
  summarizeStl,
} from "../dist/index.js";

function fixture() {
  const workers = [];
  const renderer = createBrowserCadRenderer({
    assetsOrigin: () => "https://assets.example",
    createWorker() {
      const worker = {
        terminated: 0,
        postMessage(message) {
          this.request = message;
        },
        terminate() {
          this.terminated++;
        },
      };
      workers.push(worker);
      return worker;
    },
  });
  return { renderer, workers };
}

test("host-supplied worker receives its asset origin; mesh cache belongs to one renderer", async () => {
  const first = fixture();
  const second = fixture();
  const pending = first.renderer.renderPreview("cube(1);", "source-hash");
  assert.deepEqual(first.workers[0].request, {
    source: "cube(1);",
    format: "stl",
    origin: "https://assets.example",
  });
  const bytes = new Uint8Array([1, 2, 3]);
  first.workers[0].onmessage({
    data: { ok: true, bytes, diagnostics: ["compiled"] },
  });
  assert.deepEqual(await pending, {
    bytes,
    diagnostics: [
      { code: "OPENSCAD_MESSAGE", severity: "info", message: "compiled" },
    ],
  });
  assert.equal(first.workers[0].terminated, 1);
  assert.equal(
    (await first.renderer.renderPreview("cube(1);", "source-hash")).bytes,
    bytes,
  );
  assert.equal(first.workers.length, 1);
  assert.equal(first.renderer.cachedPreview("source-hash"), bytes);
  assert.equal(second.renderer.cachedPreview("source-hash"), undefined);
});

test("cancellation skips worker construction or terminates only the active instance", async () => {
  const { renderer, workers } = fixture();
  await assert.rejects(
    renderer.renderOpenScad("cube(1);", "stl", AbortSignal.abort()),
    { name: "AbortError" },
  );
  assert.equal(workers.length, 0);
  const controller = new AbortController();
  const pending = renderer.renderOpenScad("cube(1);", "stl", controller.signal);
  controller.abort();
  await assert.rejects(pending, { name: "AbortError" });
  assert.equal(workers[0].terminated, 1);
});

test("worker failure preserves model versus operational diagnostics and always terminates", async () => {
  const { renderer, workers } = fixture();
  const invalid = renderer.renderOpenScad("cube([;", "stl");
  workers[0].onmessage({
    data: { ok: false, failureKind: "model", diagnostics: ["syntax error"] },
  });
  await assert.rejects(
    invalid,
    (error) =>
      error.failureKind === "model" &&
      error.diagnostics[0].code === "OPENSCAD_ERROR",
  );
  assert.equal(workers[0].terminated, 1);
  const unavailable = renderer.renderOpenScad("cube(1);", "stl");
  workers[1].onerror();
  await assert.rejects(unavailable, /worker failed/);
  assert.equal(workers[1].terminated, 1);
});

test("worker bootstrap installs a handler only on the supplied scope", () => {
  const previous = globalThis.onmessage;
  const scope = { onmessage: null, postMessage() {} };
  installOpenScadWorker(scope);
  assert.equal(typeof scope.onmessage, "function");
  assert.equal(globalThis.onmessage, previous);
});

test("failed host configuration closes its worker and timer", async () => {
  let terminated = 0;
  const renderer = createBrowserCadRenderer({
    createWorker: () => ({
      terminate() {
        terminated++;
      },
      postMessage() {},
    }),
    assetsOrigin() {
      throw new Error("Asset origin unavailable");
    },
  });
  await assert.rejects(
    renderer.renderOpenScad("cube(1);", "stl"),
    /Asset origin unavailable/,
  );
  assert.equal(terminated, 1);
});

test("mesh summary preserves bounds and rejects non-finite coordinates", () => {
  const bytes = new Uint8Array(134);
  const view = new DataView(bytes.buffer);
  view.setUint32(80, 1, true);
  const vertices = [
    [-2, 0, 1],
    [3, 0, 1],
    [0, 4, 1],
  ];
  vertices.forEach((vertex, index) =>
    vertex.forEach((value, axis) =>
      view.setFloat32(96 + index * 12 + axis * 4, value, true),
    ),
  );
  const summary = summarizeStl(bytes);
  assert.deepEqual(summary.bounds, { min: [-2, 0, 1], max: [3, 4, 1] });
  assert.deepEqual(summary.dimensions, [5, 4, 0]);
  view.setFloat32(96, NaN, true);
  assert.throws(
    () => summarizeStl(bytes),
    (error) => error.failureKind === "model",
  );
});

test("worker rejects modified pinned assets before module execution", async (context) => {
  context.mock.method(
    globalThis,
    "fetch",
    async () => new Response(new Uint8Array([1, 2, 3])),
  );
  const responses = [];
  const scope = {
    onmessage: null,
    postMessage: (message) => responses.push(message),
  };
  installOpenScadWorker(scope);
  await scope.onmessage({
    data: {
      source: "cube(1);",
      format: "stl",
      origin: "https://assets.example",
    },
  });
  assert.equal(responses.length, 1);
  assert.equal(responses[0].ok, false);
  assert.equal(responses[0].failureKind, "operational");
  assert.match(responses[0].message, /failed integrity verification/);
});
