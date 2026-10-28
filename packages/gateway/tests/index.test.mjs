import assert from "node:assert/strict";
import test from "node:test";
import { GATEWAY_BOUNDARY } from "../dist/index.js";
test("exposes the gateway package boundary", () => {
  assert.equal(GATEWAY_BOUNDARY, "gateway");
});
