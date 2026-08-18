import assert from "node:assert/strict";
import test from "node:test";
import { RENDERER_BOUNDARY, parseBinaryStl, parseThreeMf } from "../dist/index.js";

test("retains only bounded legacy mesh codecs", () => {
  assert.equal(RENDERER_BOUNDARY, "mesh-codecs");
  assert.equal(typeof parseBinaryStl, "function");
  assert.equal(typeof parseThreeMf, "function");
});
