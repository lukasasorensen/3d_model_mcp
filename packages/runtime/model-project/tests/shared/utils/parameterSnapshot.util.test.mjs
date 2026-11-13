import test from "node:test";
import assert from "node:assert/strict";
import {
  checkedParameterSnapshot,
  PARAMETER_HEADER_START as start,
  PARAMETER_HEADER_END as end,
} from "../../../dist/shared/utils/parameterSnapshot.util.js";

const width = {
  id: "width",
  binding: "width",
  type: "number",
  label: "Width",
  defaultValue: 10,
  value: -20.5,
};
const header = (content, body = "cube(abs(width));") =>
  `${start}\n${content}\n${end}\n${body}`;

test("storage validates actual header literals without treating quoted/commented names as assignments", () => {
  assert.deepEqual(
    checkedParameterSnapshot(
      header(
        "/* note */ width = -20.5; // units",
        'echo("width=30; // theoryfoundry:parameters:end"); cube(abs(width));',
      ),
      [width],
    ),
    [width],
  );
  const label = {
    id: "label",
    binding: "label",
    type: "string",
    label: "Label",
    value: 'A"B\nC',
    defaultValue: "",
  };
  assert.deepEqual(
    checkedParameterSnapshot(header('label="A\\"B\\nC";', "cube(1);"), [label]),
    [label],
  );
  assert.deepEqual(checkedParameterSnapshot("cube(1);", undefined), []);
});

test("storage rejects missing, ambiguous, incompatible and computed header values", () => {
  for (const source of [
    "width=-20.5; cube(1);",
    header("width=20;"),
    header("other=-20.5;"),
    header("width=-20.5; width=30;"),
    header("width=-20.5 + 0;"),
    header('width="-20.5";'),
    header("width=-20.5;", "width=99; cube(width);"),
    header("width=-20.5;", "module x(){width=10;} cube(1);"),
    header("width=-20.5;").replace("start v1", "start v2"),
    header("width=-20.5;") + `\n${end}`,
    `cube(1);\n${header("width=-20.5;")}`,
    header("width=-20.5;").replace(end, ""),
    header("include <BOSL2/std.scad> width=-20.5;"),
  ])
    assert.throws(
      () => checkedParameterSnapshot(source, [width]),
      { code: "INVALID_PARAMETERS" },
      source,
    );
});

test("model-body multiline strings do not inherit the restricted header string grammar", () => {
  const body =
    'echo("first\nsecond width=99; // theoryfoundry:parameters:end"); cube(abs(width));';
  assert.deepEqual(
    checkedParameterSnapshot(header("width=-20.5;", body), [width]),
    [width],
  );
  const label = {
    id: "label",
    binding: "label",
    label: "Label",
    type: "string",
    defaultValue: "",
    value: "first\nsecond",
  };
  assert.throws(
    () =>
      checkedParameterSnapshot(header('label="first\nsecond";', "cube(1);"), [
        label,
      ]),
    { code: "INVALID_PARAMETERS" },
  );
});

test("parameter validation failures fit the public error contract", async () => {
  const { cadErrorSchema } = await import("@theoryfoundry/contracts");
  const cases = [
    [{ ...width, value: "bad", defaultValue: "bad" }],
    [{ ...width, id: "x".repeat(100), binding: "y".repeat(100) }],
  ];
  for (const parameters of cases) {
    assert.throws(
      () => checkedParameterSnapshot(header("width=-20.5;"), parameters),
      (error) => {
        assert.equal(error.code, "INVALID_PARAMETERS");
        assert.equal(
          cadErrorSchema.safeParse({
            code: error.code,
            message: error.message,
            details: error.details,
          }).success,
          true,
        );
        assert.ok(error.details.reason.length > 0);
        return true;
      },
    );
  }
});
