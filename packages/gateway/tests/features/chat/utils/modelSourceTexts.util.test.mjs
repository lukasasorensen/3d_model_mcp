import test from "node:test";
import assert from "node:assert/strict";
import { modelSourceTexts } from "../../../../dist/features/chat/utils/modelSourceTexts.util.js";
test("individual file reads and batched edits register source text for redaction", () => {
  assert.deepEqual(modelSourceTexts({ file: { id: "a", body: "cube(1);" } }), [
    "cube(1);",
  ]);
  assert.deepEqual(
    modelSourceTexts({
      operations: [
        { op: "create_file", file: { body: "cube(2);" } },
        { op: "update_file", body: "cube(3);" },
        { op: "rename_file", name: "label", body: "not source" },
      ],
    }),
    ["cube(2);", "cube(3);"],
  );
  assert.deepEqual(
    modelSourceTexts({
      modelFiles: { files: [{ body: "cube(4);" }] },
      source: "legacy",
    }),
    ["legacy", "cube(4);"],
  );
});
