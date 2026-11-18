import test from "node:test";
import assert from "node:assert/strict";
import { CAD_LIMITS, cadErrorSchema } from "@theoryfoundry/contracts";
import {
  resolveModelDocument as resolveIdentity,
  assertNewModelDocument,
  checkedStoredModelDocument,
  PARAMETER_HEADER_START as start,
  PARAMETER_HEADER_END as end,
} from "../../../dist/shared/utils/parameterSnapshot.util.js";

function resolveModelDocument(input, inherited) {
  const document = resolveIdentity(input, inherited);
  assertNewModelDocument(document, inherited);
  return document;
}

const width = {
  id: "width",
  binding: "width",
  type: "number",
  label: "Width",
  defaultValue: 10,
  value: -20.5,
};
const modelBody = "/* unchanged */\ncube([abs(width), 2, 3]);\n";
const header = (declarations, body = modelBody) =>
  `${start}\n${declarations}\n${end}\n${body}`;

test("JSON values generate canonical declarations without editing the body", () => {
  const document = resolveModelDocument({ modelBody, parameters: [width] });
  assert.equal(document.source, header("width = -20.5;"));
  assert.equal(document.modelBody, modelBody);
  const changed = resolveModelDocument({
    modelBody,
    parameters: [{ ...width, value: 30 }],
  });
  assert.equal(changed.source, header("width = 30;"));
  assert.equal(changed.modelBody, modelBody);
  assert.equal(changed.parameters[0].defaultValue, 10);
});

test("generation escapes scalar literals and keeps source-like strings inside quotes", () => {
  const parameters = [
    {
      id: "z",
      binding: "text",
      type: "string",
      label: "Text",
      defaultValue: "",
      value: 'A"B\\C\nD\rE\t雪; width=99; // comment',
    },
    {
      id: "a",
      binding: "enabled",
      type: "boolean",
      label: "Enabled",
      defaultValue: false,
      value: true,
    },
    {
      id: "b",
      binding: "mode",
      type: "enum",
      label: "Mode",
      defaultValue: 1,
      value: 2,
      options: [
        { label: "One", value: 1 },
        { label: "Two", value: 2 },
      ],
    },
  ];
  const result = resolveModelDocument({ modelBody, parameters });
  assert.equal(
    result.source,
    header(
      'enabled = true;\nmode = 2;\ntext = "A\\"B\\\\C\\nD\\rE\\t雪; width=99; // comment";',
    ),
  );
  assert.deepEqual(
    result.parameters.map((p) => p.id),
    ["a", "b", "z"],
  );
  assert.equal(
    result.source,
    resolveModelDocument({ modelBody, parameters: parameters.toReversed() })
      .source,
  );
});

test("omission inherits the named parent snapshot; [] removes generated declarations", () => {
  assert.equal(
    resolveModelDocument({ modelBody }, [width]).source,
    header("width = -20.5;"),
  );
  assert.equal(
    resolveModelDocument({ modelBody: "cube(20);", parameters: [] }, [width])
      .source,
    "cube(20);",
  );
  assert.deepEqual(resolveModelDocument({ source: "cube(1);" }), {
    source: "cube(1);",
    parameters: [],
  });
  assert.throws(() => resolveModelDocument({ source: "cube(1);" }, [width]), {
    code: "INVALID_PARAMETERS",
  });
  assert.equal(
    resolveModelDocument({ source: "cube(1);", parameters: [] }, [width])
      .source,
    "cube(1);",
  );
});

test("generated headers are not accepted as editable bodies and bindings cannot be overwritten", () => {
  for (const body of [
    header("width = -20.5;"),
    "width=99; cube(width);",
    "module x(width=10) {cube(width);}",
    "echo(width=10);",
  ])
    assert.throws(
      () => resolveModelDocument({ modelBody: body, parameters: [width] }),
      { code: "INVALID_PARAMETERS" },
    );
  const body =
    'echo("first\nsecond width=99; // theoryfoundry:parameters:end"); /* width=2; */ cube(abs(width));';
  assert.equal(
    resolveModelDocument({ modelBody: body, parameters: [width] }).modelBody,
    body,
  );
});

test("invalid metadata, code injection and ambiguous inputs are rejected before persistence", () => {
  for (const input of [
    {},
    { source: "cube(1);", modelBody },
    { modelBody: "" },
    { source: "width=20; cube(width);", parameters: [width] },
    ...[
      null,
      [width, width],
      [{ ...width, value: "bad" }],
      [{ ...width, binding: "width; cube(99)" }],
      [{ ...width, binding: "module" }],
      [
        {
          id: "text",
          binding: "text",
          type: "string",
          label: "Text",
          value: "bad\u0000",
          defaultValue: "",
        },
      ],
      [
        {
          id: "text",
          binding: "text",
          type: "string",
          label: "Text",
          value: "valid",
          defaultValue: "bad\ud800",
        },
      ],
    ].map((parameters) => ({ modelBody, parameters })),
  ])
    assert.throws(() => resolveModelDocument(input), {
      code: "INVALID_PARAMETERS",
    });
});

test("assembled source byte limit and external-reference policy apply after generation", () => {
  assert.throws(
    () =>
      resolveModelDocument({
        modelBody: "x".repeat(CAD_LIMITS.sourceBytes),
        parameters: [width],
      }),
    { code: "SOURCE_TOO_LARGE" },
  );
  assert.throws(
    () =>
      resolveModelDocument({
        modelBody: "include <../secret.scad>",
        parameters: [width],
      }),
    { code: "FORBIDDEN_SOURCE_REFERENCE" },
  );
});

test("stored documents are verified by deterministic reassembly, with legacy records unchanged", () => {
  const document = resolveModelDocument({ modelBody, parameters: [width] });
  assert.deepEqual(
    checkedStoredModelDocument(document.source, modelBody, [width]),
    [width],
  );
  assert.throws(
    () =>
      checkedStoredModelDocument(document.source, modelBody, [
        { ...width, value: 30 },
      ]),
    { code: "CORRUPT_PROJECT" },
  );
  assert.throws(
    () => checkedStoredModelDocument(document.source, "cube(99);", [width]),
    { code: "CORRUPT_PROJECT" },
  );
  assert.deepEqual(
    checkedStoredModelDocument("cube(1);", undefined, undefined),
    [],
  );
});

test("parameter validation failures fit the public error contract", () => {
  assert.throws(
    () =>
      resolveModelDocument({
        modelBody,
        parameters: [{ ...width, value: "bad" }],
      }),
    (error) => {
      assert.equal(
        cadErrorSchema.safeParse({
          code: error.code,
          message: error.message,
          details: error.details,
        }).success,
        true,
      );
      assert.ok(
        error.details.reason.length > 0 && error.details.reason.length <= 200,
      );
      return true;
    },
  );
});

test("generation v1 canonicalizes finite numeric extremes and leaves metadata out of source", () => {
  for (const value of [
    -0,
    -2.5,
    1e-7,
    1e21,
    2.2250738585072014e-308,
    Number.MAX_VALUE,
  ]) {
    const input = { modelBody, parameters: [{ ...width, value }] };
    const document = resolveModelDocument(input);
    assert.equal(document.source, header(`width = ${String(value)};`));
    assert.equal(
      resolveModelDocument({
        ...input,
        parameters: [
          { ...width, value, label: "New label", description: "ignored" },
        ],
      }).source,
      document.source,
    );
    assert.equal(document.modelBody, modelBody);
  }
});

test("subnormal proposal values fail with a field path while historical v1 documents remain readable", () => {
  for (const value of [Number.MIN_VALUE, -1e-308]) {
    for (const key of ["value", "defaultValue"])
      assert.throws(
        () =>
          resolveModelDocument({
            modelBody,
            parameters: [{ ...width, [key]: value }],
          }),
        (error) => {
          assert.match(error.details.reason, new RegExp(`${key}: Nonzero`));
          return true;
        },
      );
    assert.deepEqual(
      checkedStoredModelDocument(header(`width = ${value};`), modelBody, [
        { ...width, value },
      ]),
      [{ ...width, value }],
    );
  }
  assert.throws(
    () =>
      resolveModelDocument({
        modelBody,
        parameters: [
          {
            id: "mode",
            binding: "mode",
            label: "Mode",
            type: "enum",
            value: 1,
            defaultValue: 1,
            options: [
              { label: "One", value: 1 },
              { label: "Tiny", value: 1e-308 },
            ],
          },
        ],
      }),
    (error) => {
      assert.equal(error.details.field, "options.1.value");
      assert.equal(error.details.parameterId, "mode");
      return true;
    },
  );
});

test("numeric diagnostics identify stable IDs, bindings and fields regardless of input order", () => {
  const valid = { ...width, id: "z", binding: "valid", value: 20 };
  for (const field of ["value", "defaultValue"]) {
    const invalid = { ...width, id: "a", binding: "tiny", [field]: 1e-308 };
    for (const parameters of [
      [valid, invalid],
      [invalid, valid],
    ])
      assert.throws(
        () => resolveModelDocument({ modelBody: "cube(valid);", parameters }),
        (error) => {
          assert.equal(error.details.parameterId, "a");
          assert.equal(error.details.binding, "tiny");
          assert.equal(error.details.field, field);
          assert.doesNotMatch(error.details.reason, /parameters\.\d/);
          assert.equal(
            cadErrorSchema.safeParse({
              code: error.code,
              message: error.message,
              details: error.details,
            }).success,
            true,
          );
          return true;
        },
      );
  }
  const invalidEnum = {
    id: "a",
    binding: "choice",
    label: "Choice",
    type: "enum",
    value: 1,
    defaultValue: 1,
    options: [
      { label: "Normal", value: 1 },
      { label: "Subnormal", value: 1e-308 },
    ],
  };
  assert.throws(
    () =>
      resolveModelDocument({
        modelBody: "cube(valid);",
        parameters: [valid, invalidEnum],
      }),
    (error) => {
      assert.equal(error.details.parameterId, "a");
      assert.equal(error.details.binding, "choice");
      assert.equal(error.details.field, "options.1.value");
      return true;
    },
  );
});

test("resolve rejects expanded model files before retry lookup and counts the generated header", () => {
  const names = Array.from({ length: 100 }, (_, index) => `object-${index}`);
  const repeated = {
    version: 1,
    files: [
      { id: "f", name: "Body", body: `/*${"雪".repeat(80_000)}*/cube(1);` },
    ],
    objects: names.map((id) => ({ id, name: id, fileId: "f" })),
    composition: { operation: "union", objectIds: names },
  };
  assert.throws(() => resolveIdentity({ modelFiles: repeated }), {
    code: "SOURCE_TOO_LARGE",
  });

  const pair = {
    ...repeated,
    objects: repeated.objects.slice(0, 2),
    composition: { operation: "union", objectIds: names.slice(0, 2) },
    files: [{ ...repeated.files[0], body: "cube(1);" }],
  };
  const wrapperBytes =
    Buffer.byteLength(resolveIdentity({ modelFiles: pair }).source) -
    2 * Buffer.byteLength("cube(1);");
  const targetFileBytes = (CAD_LIMITS.sourceBytes - wrapperBytes) / 2;
  const suffix = "*/cube(1);";
  const fillerBytes =
    Math.floor(targetFileBytes) - Buffer.byteLength("/*" + suffix);
  pair.files[0].body =
    "/*" +
    "雪".repeat(Math.floor(fillerBytes / 3)) +
    " ".repeat(fillerBytes % 3) +
    suffix;
  const accepted = resolveIdentity({ modelFiles: pair });
  assert.ok(Buffer.byteLength(accepted.source) >= CAD_LIMITS.sourceBytes - 1);
  assert.throws(
    () => resolveIdentity({ modelFiles: pair, parameters: [width] }),
    {
      code: "SOURCE_TOO_LARGE",
    },
  );
});
