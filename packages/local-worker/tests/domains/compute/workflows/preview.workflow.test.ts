import test from "node:test";
import assert from "node:assert/strict";
import { previewLocally } from "../../../../src/domains/compute/index.js";
import { fixture, hash, signal } from "../../../fixtures/compute.fixture.js";
void test("PNG uses the resolved immutable target and binds the metadata to image bytes", async () => {
  const f = fixture();
  const png = Buffer.alloc(33);
  Buffer.from("89504e470d0a1a0a", "hex").copy(png);
  png.write("IHDR", 12);
  png.writeUInt32BE(768, 16);
  png.writeUInt32BE(768, 20);
  f.setRender({ ok: true, encoded: png.toString("base64") });
  const result = await previewLocally(
    { projectId: "project", view: "front" },
    f.deps,
    signal(),
  );
  assert.equal(result.metadata.revisionId, "revision");
  assert.equal(result.metadata.imageHash, hash(png));
  assert.equal(result.metadata.view, "front");
});
void test("preview refuses a response for a different selected target", async () => {
  const f = fixture();
  await assert.rejects(
    previewLocally(
      { projectId: "project", candidateId: "candidate" },
      f.deps,
      signal(),
    ),
    /does not match/,
  );
});
void test("preview refuses malformed image output", async () => {
  const f = fixture();
  await assert.rejects(
    previewLocally({ projectId: "project" }, f.deps, signal()),
    /PNG failed/,
  );
});
