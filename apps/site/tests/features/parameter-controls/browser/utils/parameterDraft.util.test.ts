import test from "node:test";
import assert from "node:assert/strict";
import type { ProjectParameter } from "@theoryfoundry/contracts";
import {
  parameterDraft,
  validateParameterDraft,
  reapplyParameterDraft,
} from "../../../../../src/features/parameter-controls/browser/utils/parameterDraft.util";

const width: ProjectParameter = {
  id: "width",
  binding: "width",
  type: "number",
  label: "Width",
  value: 20,
  defaultValue: 10,
  min: 0,
  max: 100,
  step: 0.5,
  control: "slider",
};
const parameters: ProjectParameter[] = [
  width,
  {
    id: "count",
    binding: "count",
    type: "integer",
    label: "Count",
    value: 2,
    defaultValue: 1,
  },
  {
    id: "enabled",
    binding: "enabled",
    type: "boolean",
    label: "Enabled",
    value: true,
    defaultValue: false,
  },
  {
    id: "text",
    binding: "text",
    type: "string",
    label: "Text",
    value: "a\nb",
    defaultValue: "雪",
    maxLength: 5,
  },
  {
    id: "enum",
    binding: "style",
    type: "enum",
    label: "Style",
    value: 1,
    defaultValue: 2,
    options: [
      { label: "One", value: 1 },
      { label: "Two", value: 2 },
    ],
  },
  {
    id: "string-enum",
    binding: "mode",
    type: "enum",
    label: "Mode",
    value: "a",
    defaultValue: "b",
    options: [
      { label: "A", value: "a" },
      { label: "B", value: "b" },
    ],
  },
];
void test("drafts preserve independent defaults, multiline strings and typed enum values", () => {
  const draft = parameterDraft(parameters);
  assert.equal(draft.text, "a\nb");
  assert.deepEqual(validateParameterDraft(parameters, draft).operations, []);
  const reset = validateParameterDraft(
    parameters,
    parameterDraft(parameters, true),
  );
  assert.deepEqual(Object.keys(reset.errors), []);
  assert.deepEqual(
    reset.operations.map((p) => p.value),
    [10, 1, false, "雪", 2, "b"],
  );
});
void test("incomplete numeric input, unsafe integers, bounds, step and strings never coerce or clamp", () => {
  for (const value of ["", "-", "1e", "0x20", "Infinity", "101", "0.3"]) {
    assert.ok(
      validateParameterDraft([width], { width: value }).errors.width,
      value,
    );
  }
  assert.equal(
    validateParameterDraft([width], { width: "2.5e1" }).operations[0]?.value,
    25,
  );
  const bad = validateParameterDraft(parameters, {
    ...parameterDraft(parameters),
    count: "9007199254740992",
    text: "longer",
    enum: "3",
  });
  assert.deepEqual(Object.keys(bad.errors), ["count", "text", "enum"]);
});
void test("reapply copies only edited values with unchanged definitions and reports removal or type changes", () => {
  const draft = {
    ...parameterDraft(parameters),
    width: "30",
    count: "4",
    text: "new",
  };
  const latest = parameters
    .filter((p) => p.id !== "text")
    .map((p) =>
      p.id === "width" && p.type === "number"
        ? { ...p, value: 25 }
        : p.id === "count"
          ? { ...p, label: "New count" }
          : p,
    );
  const result = reapplyParameterDraft(parameters, draft, latest);
  assert.equal(result.draft.width, "30");
  assert.equal(result.draft.count, "2");
  assert.deepEqual(result.conflicts, ["Count", "Text"]);
});

void test("opaque parameter IDs cannot inherit or mutate draft error properties", () => {
  for (const id of ["__proto__", "constructor", "toString"]) {
    const parameter = { ...width, id };
    const valid = validateParameterDraft(
      [parameter],
      parameterDraft([parameter]),
    );
    assert.equal(valid.errors[id], undefined);
    const invalid = validateParameterDraft([parameter], { [id]: "invalid" });
    assert.equal(typeof invalid.errors[id], "string");
    assert.deepEqual(Object.keys(invalid.errors), [id]);
  }
});
