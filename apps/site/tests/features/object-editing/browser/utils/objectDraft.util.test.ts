import test from "node:test";
import assert from "node:assert/strict";
import { objectPreviewSources } from "../../../../../src/features/object-editing/browser/utils/objectDraft.util";
void test("selected geometry uses matching parameter context and raw file without double-applying its transform", () => {
  const files = {
    version: 1 as const,
    files: [{ id: "f", name: "Part", body: "cube(width);" }],
    objects: [
      {
        id: "o",
        name: "Part",
        fileId: "f",
        transform: {
          position: [4, 0, 0] as [number, number, number],
          rotation: [0, 0, 0] as [number, number, number],
          scale: [2, 2, 2] as [number, number, number],
        },
      },
    ],
    composition: { operation: "union" as const, objectIds: ["o"] },
  };
  assert.equal(
    objectPreviewSources(files.files, [
      {
        id: "w",
        binding: "width",
        label: "Width",
        type: "number",
        value: 5,
        defaultValue: 5,
      },
    ]).get("f"),
    "width = 5;\ncube(width);",
  );
  assert.equal(objectPreviewSources(files.files, []).get("missing"), undefined);
});
