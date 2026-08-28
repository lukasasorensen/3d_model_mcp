import assert from "node:assert/strict";
import test from "node:test";
import { PRODUCT_ID, projectListSchema } from "@rjls/contracts";

test("site consumes the browser-safe workspace contract", () => {
  assert.equal(PRODUCT_ID, "3d_model_mcp");
});

test("project lists expose opaque project IDs only", () => {
  assert.equal(projectListSchema.safeParse({ projects: [{ projectId: "demo-project" }] }).success, true);
  assert.equal(projectListSchema.safeParse({ projects: [{ projectId: "../private" }] }).success, false);
});
