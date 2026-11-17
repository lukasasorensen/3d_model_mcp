import test from "node:test";
import assert from "node:assert/strict";
import {
  applyModelFileOperations,
  copyModelObject,
  defaultObjectTransform,
  modelFilesSchema,
  objectTransform,
  objectTransformSchema,
  pasteModelObject,
} from "../../../../dist/index.js";

const snapshot = () => ({
  version: 1,
  files: [{ id: "source", name: "Block", body: "cube(width);" }],
  objects: [
    { id: "one", name: "First", fileId: "source" },
    { id: "two", name: "Second", fileId: "source" },
  ],
  composition: { operation: "union", objectIds: ["one", "two"] },
});
const parameters = [
  {
    id: "width",
    type: "number",
    binding: "width",
    label: "Width",
    value: 5,
    defaultValue: 5,
  },
];
const transform = () => ({
  position: [12, -3, 4],
  rotation: [45, 20, 90],
  scale: [2, 1, 0.5],
});

test("object transforms are bounded and never alter other references to shared source", () => {
  const original = snapshot();
  const result = applyModelFileOperations(original, [
    { op: "set_object_transform", id: "one", transform: transform() },
  ]);
  assert.deepEqual(result.objects[0].transform, transform());
  assert.deepEqual(
    objectTransform(result.objects[1]),
    defaultObjectTransform(),
  );
  assert.deepEqual(result.files, original.files);
  assert.equal(original.objects[0].transform, undefined);
  const detached = objectTransform(result.objects[0]);
  detached.position[0] = 100;
  assert.equal(result.objects[0].transform.position[0], 12);
  assert.throws(() =>
    applyModelFileOperations(original, [
      { op: "set_object_transform", id: "missing", transform: transform() },
    ]),
  );
  for (const invalid of [
    { scale: [0, 1, 1] },
    { scale: [-1, 1, 1] },
    { scale: [1e8, 1, 1] },
    { position: [Infinity, 0, 0] },
    { position: [1e8, 0, 0] },
    { rotation: [NaN, 0, 0] },
    { rotation: [0, 0] },
  ])
    assert.equal(
      objectTransformSchema.safeParse({ ...transform(), ...invalid }).success,
      false,
    );
  assert.equal(
    modelFilesSchema.parse(original).objects[0].transform,
    undefined,
  );
});

test("copy freezes source and settings; repeated paste creates independent objects and files", () => {
  const original = applyModelFileOperations(snapshot(), [
    { op: "set_object_transform", id: "one", transform: transform() },
  ]);
  const before = structuredClone(original);
  const clipboard = copyModelObject({
    projectId: "project",
    modelFiles: original,
    objectId: "one",
    parameters,
  });
  assert.deepEqual(original, before);
  original.files[0].body = "sphere(9);";
  original.objects[0].transform.position[0] = 99;
  let pasted = pasteModelObject({
    projectId: "project",
    modelFiles: original,
    clipboard,
    parameters,
    objectId: "copy-one",
    fileId: "copy-source-one",
  });
  pasted = pasteModelObject({
    projectId: "project",
    modelFiles: pasted,
    clipboard,
    parameters,
    objectId: "copy-two",
    fileId: "copy-source-two",
  });
  assert.equal(
    pasted.files.find((file) => file.id === "copy-source-one").body,
    "cube(width);",
  );
  assert.deepEqual(
    pasted.objects.find((object) => object.id === "copy-one").transform,
    transform(),
  );
  assert.deepEqual(
    pasted.objects.find((object) => object.id === "one"),
    original.objects[0],
  );
  assert.deepEqual(pasted.presentation.objectOrder, [
    "one",
    "two",
    "copy-one",
    "copy-two",
  ]);
  const edited = applyModelFileOperations(pasted, [
    { op: "update_file", id: "copy-source-one", body: "cube(12);" },
  ]);
  assert.equal(
    edited.files.find((file) => file.id === "source").body,
    "sphere(9);",
  );
  assert.equal(
    edited.files.find((file) => file.id === "copy-source-two").body,
    "cube(width);",
  );
});

test("paste rejects other projects, collisions, malformed payloads and changed parameter bindings atomically", () => {
  const original = snapshot();
  const clipboard = copyModelObject({
    projectId: "project",
    modelFiles: original,
    objectId: "one",
    parameters,
  });
  const input = {
    projectId: "project",
    modelFiles: original,
    clipboard,
    parameters,
    objectId: "new-object",
    fileId: "new-file",
  };
  const before = structuredClone(original);
  for (const invalid of [
    { projectId: "another" },
    { objectId: "one" },
    { fileId: "source" },
    { clipboard: null },
    { parameters: [] },
    { parameters: [{ ...parameters[0], value: 6 }] },
  ])
    assert.throws(() => pasteModelObject({ ...input, ...invalid }));
  assert.throws(() =>
    copyModelObject({
      projectId: "project",
      modelFiles: original,
      objectId: "missing",
    }),
  );
  assert.deepEqual(original, before);
  const renamed = [{ ...parameters[0], label: "Renamed width" }];
  assert.doesNotThrow(() =>
    pasteModelObject({ ...input, parameters: renamed }),
  );
});
