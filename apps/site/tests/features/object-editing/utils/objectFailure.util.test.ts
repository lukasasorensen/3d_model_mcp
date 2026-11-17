import test from "node:test";
import assert from "node:assert/strict";
import {
  objectFailure,
  toolFailure,
} from "../../../../src/features/object-editing/utils/objectFailure.util";
void test("unsupported object content exposes bounded model-facing reasons without unrelated metadata", () => {
  const result = objectFailure(
    toolFailure({
      code: "INVALID_MODEL_FILES",
      message: "Invalid model file body.",
      details: {
        reason: "Model files must be self-contained.",
        privateValue: "do-not-forward",
      },
    }),
  );
  assert.equal(
    result.message,
    "Invalid model file body. Model files must be self-contained.",
  );
  assert.equal(JSON.stringify(result).includes("do-not-forward"), false);
});
