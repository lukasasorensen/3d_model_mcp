import test from "node:test";
import assert from "node:assert/strict";
import * as z from "zod/v4";
import {
  projectParameterSchema,
  parameterSnapshotSchema,
  parameterSnapshotsEqual,
  proposeModelSourceInputSchema,
} from "../../../dist/index.js";

const width = {
  id: "width-id",
  binding: "width",
  label: "Width",
  type: "number",
  value: 20,
  defaultValue: 10,
  min: 0,
  max: 100,
  step: 0.5,
  control: "slider",
};

test("parameter metadata validates values, defaults, bounds and control compatibility", () => {
  assert.equal(projectParameterSchema.parse(width).defaultValue, 10);
  for (const patch of [
    { value: "20" },
    { value: Infinity },
    { value: NaN },
    { value: 101 },
    { defaultValue: -1 },
    { min: 110 },
    { step: 0 },
    { step: 3 },
    { control: "checkbox" },
    { binding: "$fn" },
    { type: "integer", value: 2.5 },
    { type: "integer", step: 0.5 },
  ])
    assert.equal(
      projectParameterSchema.safeParse({ ...width, ...patch }).success,
      false,
      JSON.stringify(patch),
    );
  assert.equal(
    projectParameterSchema.safeParse({ ...width, type: "integer", step: 1 })
      .success,
    true,
  );
  const boolean = {
    id: "flag",
    binding: "flag",
    label: "Flag",
    type: "boolean",
    value: true,
    defaultValue: false,
  };
  assert.equal(projectParameterSchema.safeParse(boolean).success, true);
  assert.equal(
    projectParameterSchema.safeParse({ ...boolean, value: "true" }).success,
    false,
  );
  const string = {
    id: "text",
    binding: "text",
    label: "Text",
    type: "string",
    value: "abc",
    defaultValue: "a",
    maxLength: 3,
  };
  assert.equal(projectParameterSchema.safeParse(string).success, true);
  assert.equal(
    projectParameterSchema.safeParse({ ...string, defaultValue: "long" })
      .success,
    false,
  );
});

test("typed enum values and options are unique, homogeneous and closed", () => {
  const value = {
    id: "style",
    binding: "style",
    label: "Style",
    type: "enum",
    value: "plain",
    defaultValue: "round",
    options: [
      { label: "Plain", value: "plain" },
      { label: "Round", value: "round" },
    ],
  };
  assert.equal(projectParameterSchema.safeParse(value).success, true);
  for (const patch of [
    { value: "other" },
    { defaultValue: 1 },
    { options: [...value.options, value.options[0]] },
    { options: [...value.options, { label: "Number", value: 2 }] },
  ])
    assert.equal(
      projectParameterSchema.safeParse({ ...value, ...patch }).success,
      false,
    );
});

test("snapshot identity is deterministic without changing JSON Schema generation", () => {
  assert.equal(
    parameterSnapshotSchema.safeParse([width, { ...width, id: "other" }])
      .success,
    false,
  );
  assert.equal(
    parameterSnapshotSchema.safeParse([width, { ...width, binding: "other" }])
      .success,
    false,
  );
  const other = { ...width, id: "other", binding: "other" };
  assert.equal(parameterSnapshotsEqual([width, other], [other, width]), true);
  assert.equal(
    parameterSnapshotsEqual([width], [{ ...width, label: "Diameter" }]),
    false,
  );
  assert.doesNotThrow(() => z.toJSONSchema(proposeModelSourceInputSchema));
  assert.equal(
    parameterSnapshotSchema.safeParse(
      Array.from({ length: 100 }, (_, index) => ({
        ...width,
        id: `id${index}`,
        binding: `binding${index}`,
        description: "x".repeat(2000),
      })),
    ).success,
    false,
  );
  assert.equal(parameterSnapshotSchema.safeParse(null).success, false);
});
