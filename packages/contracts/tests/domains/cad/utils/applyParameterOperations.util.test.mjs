import test from "node:test";
import assert from "node:assert/strict";
import {
  applyParameterOperations,
  editParametersInputSchema,
} from "../../../../dist/index.js";

const width = {
  id: "width",
  binding: "width",
  label: "Width",
  type: "number",
  value: 20,
  defaultValue: 10,
  min: 0,
  max: 100,
  step: 1,
};
const base = {
  projectId: "project",
  parentRevision: null,
  requestId: "request",
  toolCallId: "tool",
};

test("batched CRUD supports all scalar types, independent defaults and metadata replacement", () => {
  const parameters = [
    width,
    { ...width, id: "count", binding: "count", type: "integer" },
    {
      id: "enabled",
      binding: "enabled",
      label: "Enabled",
      type: "boolean",
      value: true,
      defaultValue: false,
    },
    {
      id: "text",
      binding: "text",
      label: "Text",
      type: "string",
      value: "雪",
      defaultValue: "default",
    },
    {
      id: "style",
      binding: "style",
      label: "Style",
      type: "enum",
      value: "a",
      defaultValue: "b",
      options: [
        { label: "A", value: "a" },
        { label: "B", value: "b" },
      ],
    },
    {
      id: "factor",
      binding: "factor",
      label: "Factor",
      type: "enum",
      value: 1,
      defaultValue: 2,
      options: [
        { label: "One", value: 1 },
        { label: "Two", value: 2 },
      ],
    },
  ];
  const create = editParametersInputSchema.parse({
    ...base,
    operations: parameters.map((parameter) => ({ op: "create", parameter })),
  });
  const snapshot = applyParameterOperations([], create.operations);
  assert.deepEqual(
    snapshot.map((p) => p.id),
    ["count", "enabled", "factor", "style", "text", "width"],
  );
  const values = {
    width: 30,
    count: 3,
    enabled: false,
    text: '"\\\n',
    style: "b",
    factor: 2,
  };
  const changed = applyParameterOperations(
    snapshot,
    snapshot.map((p) => ({ op: "set_value", id: p.id, value: values[p.id] })),
  );
  for (const p of changed) {
    assert.equal(p.value, values[p.id]);
    assert.equal(
      p.defaultValue,
      parameters.find((old) => old.id === p.id).defaultValue,
    );
  }
  const updated = applyParameterOperations(changed, [
    { op: "update", parameter: { ...width, label: "Span", defaultValue: 5 } },
    { op: "delete", id: "text" },
  ]);
  assert.equal(updated.find((p) => p.id === "width").label, "Span");
  assert.equal(updated.find((p) => p.id === "width").defaultValue, 5);
  assert.ok(!updated.some((p) => p.id === "text"));
  assert.equal(snapshot.find((p) => p.id === "width").value, 20);
});

test("bindings are checked after the whole batch, permitting swaps and delete/create reuse", () => {
  const height = { ...width, id: "height", binding: "height" };
  const result = applyParameterOperations(
    [width, height],
    [
      { op: "update", parameter: { ...width, binding: "height" } },
      { op: "update", parameter: { ...height, binding: "width" } },
    ],
  );
  assert.equal(result.find((p) => p.id === "width").binding, "height");
  assert.deepEqual(
    applyParameterOperations(
      [width],
      [
        { op: "create", parameter: { ...width, id: "replacement" } },
        { op: "delete", id: "width" },
      ],
    ),
    [{ ...width, id: "replacement" }],
  );
});

test("strict input and final snapshot reject invalid operations and constraints", () => {
  for (const operations of [
    [],
    Array(201).fill({ op: "delete", id: "x" }),
    [
      { op: "set_value", id: "width", value: 30 },
      { op: "delete", id: "width" },
    ],
    [{ op: "create", parameter: { ...width, extra: true } }],
  ]) {
    assert.equal(
      editParametersInputSchema.safeParse({ ...base, operations }).success,
      false,
    );
  }
  for (const operations of [
    [{ op: "create", parameter: width }],
    [{ op: "update", parameter: { ...width, id: "missing" } }],
    [{ op: "delete", id: "missing" }],
    [{ op: "set_value", id: "missing", value: 1 }],
    [{ op: "set_value", id: "width", value: "30" }],
    [{ op: "set_value", id: "width", value: 101 }],
    [{ op: "set_value", id: "width", value: 0.5 }],
    [{ op: "create", parameter: { ...width, id: "other" } }],
    [{ op: "update", parameter: { ...width, defaultValue: 200 } }],
    [{ op: "update", parameter: { ...width, binding: "$fn" } }],
  ])
    assert.throws(() => applyParameterOperations([width], operations));
  assert.throws(() =>
    applyParameterOperations(
      [],
      Array.from({ length: 101 }, (_, i) => ({
        op: "create",
        parameter: { ...width, id: `p${i}`, binding: `p${i}` },
      })),
    ),
  );
  assert.throws(() =>
    applyParameterOperations(
      [],
      Array.from({ length: 100 }, (_, i) => ({
        op: "create",
        parameter: {
          ...width,
          id: `p${i}`,
          binding: `p${i}`,
          description: "x".repeat(2000),
        },
      })),
    ),
  );
});

test("final snapshot diagnostics identify stable IDs independently of edit ordering", () => {
  assert.throws(
    () =>
      applyParameterOperations(
        [
          { ...width, id: "z-width" },
          { ...width, id: "a-height", binding: "height" },
        ],
        [
          { op: "set_value", id: "a-height", value: 30 },
          { op: "set_value", id: "z-width", value: "bad" },
        ],
      ),
    (error) => {
      assert.deepEqual(error.issues[0].path, [
        "parameters",
        "z-width",
        "value",
      ]);
      return true;
    },
  );
});
