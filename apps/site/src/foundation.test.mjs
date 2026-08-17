import assert from "node:assert/strict";
import test from "node:test";
import { PRODUCT_ID } from "@rjls/contracts";

test("site consumes the browser-safe workspace contract", () => {
  assert.equal(PRODUCT_ID, "3d_model_mcp");
});
