import test from "node:test";
import assert from "node:assert/strict";
import {
  applyModelFileOperations,
  modelFilesSchema,
  modelFilesPresentation,
  modelFileState,
  visibleModelObjectIds,
} from "../../../../dist/index.js";
const base = {
  version: 1,
  files: [
    { id: "a", name: "A", body: "cube(2);" },
    { id: "b", name: "B", body: "cube(1);" },
  ],
  objects: [
    { id: "a", name: "A", fileId: "a" },
    { id: "b", name: "B", fileId: "b" },
  ],
  composition: { operation: "difference", objectIds: ["a", "b"] },
};
test("display order, labels and visibility preserve stable references and boolean operand order", () => {
  const result = applyModelFileOperations(base, [
    { op: "reorder_files", ids: ["b", "a"] },
    { op: "reorder_objects", ids: ["b", "a"] },
    { op: "rename_file", id: "a", name: "renamed" },
    { op: "rename_object", id: "b", name: "Cutout" },
    { op: "set_object_visibility", id: "b", visible: false },
  ]);
  assert.equal(result.version, 2);
  assert.deepEqual(result.composition, base.composition);
  assert.deepEqual(result.presentation.objectOrder, ["b", "a"]);
  assert.deepEqual(visibleModelObjectIds(result), ["a"]);
  assert.equal(base.files[0].name, "A");
  assert.equal(modelFileState(result).files[0].body, undefined);
  assert.deepEqual(modelFilesPresentation(base).hiddenObjectIds, []);
});
test("batched create, update, reassign and remove preserve referential integrity", () => {
  const result = applyModelFileOperations(base, [
    { op: "create_file", file: { id: "c", name: "C", body: "sphere(3);" } },
    { op: "create_object", object: { id: "c", name: "C", fileId: "c" } },
    { op: "update_file", id: "c", body: "sphere(4);" },
    { op: "update_object", id: "b", fileId: "c" },
    { op: "remove_file", id: "b" },
    { op: "remove_object", id: "c" },
  ]);
  assert.equal(result.objects.find((o) => o.id === "b").fileId, "c");
  assert.equal(result.files.find((f) => f.id === "c").body, "sphere(4);");
  assert.deepEqual(result.composition.objectIds, ["a", "b"]);
  for (const operations of [
    [{ op: "remove_file", id: "a" }],
    [{ op: "remove_object", id: "a" }],
    [{ op: "update_object", id: "b", fileId: "missing" }],
    [{ op: "rename_file", id: "missing", name: "X" }],
    [{ op: "create_object", object: base.objects[0] }],
    [{ op: "reorder_objects", ids: ["a", "a"] }],
  ])
    assert.throws(() => applyModelFileOperations(base, operations));
});
test("hidden difference base never promotes a subtractor and hidden file affects every reference", () => {
  const hidden = applyModelFileOperations(base, [
    { op: "set_file_visibility", id: "a", visible: false },
  ]);
  assert.deepEqual(visibleModelObjectIds(hidden), []);
  const intersection = {
    ...base,
    composition: { ...base.composition, operation: "intersection" },
  };
  assert.deepEqual(
    visibleModelObjectIds(
      applyModelFileOperations(intersection, [
        { op: "set_object_visibility", id: "a", visible: false },
      ]),
    ),
    ["b"],
  );
  const visible = applyModelFileOperations(hidden, [
    { op: "set_file_visibility", id: "a", visible: true },
  ]);
  assert.deepEqual(visibleModelObjectIds(visible), ["a", "b"]);
});
test("strict v2 presentation validates complete permutations and bounded subsets", () => {
  const snapshot = applyModelFileOperations(base, [
    { op: "rename_file", id: "a", name: "A" },
  ]);
  for (const patch of [
    { fileOrder: ["a"] },
    { objectOrder: ["a", "missing"] },
    { hiddenFileIds: ["missing"] },
    { hiddenObjectIds: ["a", "a"] },
  ])
    assert.equal(
      modelFilesSchema.safeParse({
        ...snapshot,
        presentation: { ...snapshot.presentation, ...patch },
      }).success,
      false,
    );
  assert.equal(
    modelFilesSchema.safeParse({ ...base, presentation: snapshot.presentation })
      .success,
    false,
  );
});
