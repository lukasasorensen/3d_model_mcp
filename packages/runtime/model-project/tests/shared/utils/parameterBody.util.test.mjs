import test from "node:test";
import assert from "node:assert/strict";
import { cadErrorSchema } from "@theoryfoundry/contracts";
import { resolveModelDocument } from "../../../dist/shared/utils/parameterSnapshot.util.js";

const width = {
  id: "width",
  binding: "width",
  type: "number",
  label: "Width",
  value: 20,
  defaultValue: 10,
};
const resolve = (modelBody, parameters = [width], previous = []) =>
  resolveModelDocument({ modelBody, parameters }, previous);

for (const body of [
  "width=10; cube(width);",
  "{ width = 10; cube(width); }",
  "let(width=10) cube(width);",
  "for(width=[1:2]) cube(width);",
  "echo([for(width=[1:2]) width]);",
  "cube(width=10);",
  "module m(width) { cube(width); } m(1);",
  "function f(width) = width; cube(f(1));",
  "f = function(width) width; cube(f(1));",
  "module m(other=[1,2], width) { cube(width); } m();",
  "function f(other=sin(1), width=2) = width; cube(f());",
])
  test(`rejects managed-name shadowing: ${body}`, () => {
    assert.throws(
      () => resolve(body),
      (error) => {
        assert.equal(error.code, "INVALID_PARAMETERS");
        assert.equal(error.details.binding, "width");
        assert.match(error.details.reason, /Rename/);
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
  });

test("reports body-relative locations and allows comparisons and unrelated locals", () => {
  assert.throws(
    () => resolve("// first\n  width = 5;"),
    (error) => {
      assert.equal(error.details.line, 2);
      assert.equal(error.details.column, 3);
      return true;
    },
  );
  const body =
    '/* width=2; */\nmodule m(local) { cube(local); }\nassert(width == 20);\necho("width=3"); m(width);';
  assert.equal(resolve(body).modelBody, body);
  assert.equal(
    resolve("function f(x=width) = x; cube(f());").parameters.length,
    1,
  );
});

test("header markers are rejected even after removing the final definition or switching modes", () => {
  for (const marker of [
    "// theoryfoundry:parameters:start v1",
    "//theoryfoundry:parameters:end",
    "//  theoryfoundry:parameters:start v99",
  ]) {
    for (const parameters of [[], [width]])
      assert.throws(() => resolve(`${marker}\ncube(1);`, parameters), {
        code: "INVALID_PARAMETERS",
      });
    assert.throws(
      () =>
        resolveModelDocument(
          { source: `${marker}\ncube(1);`, parameters: [] },
          [width],
        ),
      { code: "INVALID_PARAMETERS" },
    );
  }
  assert.equal(
    resolve('echo("// theoryfoundry:parameters:start v1"); cube(width);')
      .parameters.length,
    1,
  );
});

test("removal and rename require explicit reference changes, never automatic replacement", () => {
  for (const parameters of [[], [{ ...width, binding: "span" }]]) {
    assert.throws(
      () => resolve("cube(width);", parameters, [width]),
      (error) => {
        assert.equal(error.details.diagnostic, "REMOVED_BINDING");
        return true;
      },
    );
    assert.throws(
      () =>
        resolveModelDocument({ source: "cube(width);", parameters: [] }, [
          width,
        ]),
      { code: "INVALID_PARAMETERS" },
    );
  }
  const renamed = resolve(
    "cube(span);",
    [{ ...width, binding: "span" }],
    [width],
  );
  assert.match(renamed.source, /span = 20;/);
  assert.doesNotMatch(renamed.source, /width/);
  const removed = resolve('/* width */ echo("width"); cube(20);', [], [width]);
  assert.equal(removed.source, removed.modelBody);
});

test("includes are conservatively rejected; use paths and comment/string content are not bindings", () => {
  assert.throws(
    () => resolve("include <BOSL2/std.scad>\ncube(width);"),
    (error) => {
      assert.equal(error.details.diagnostic, "INCLUDE_CONFLICT");
      return true;
    },
  );
  assert.equal(
    resolve("include <BOSL2/std.scad>\ncube(1);", []).parameters.length,
    0,
  );
  const body =
    'use <BOSL2/width.scad>\n// include <BOSL2/std.scad>\necho("include"); cube(20);';
  assert.equal(resolve(body, [], [width]).modelBody, body);
  assert.equal(
    resolve("use <BOSL2/math.scad>\ncube(width);").parameters.length,
    1,
  );
});

test("lexical errors are actionable; invalid values identify the JSON field", () => {
  for (const body of ["cube(width); /*", 'echo("oops);'])
    assert.throws(
      () => resolve(body),
      (error) => {
        assert.match(error.details.reason, /Unterminated/);
        return true;
      },
    );
  assert.throws(
    () => resolve("cube(width);", [{ ...width, value: Infinity }]),
    (error) => {
      assert.match(error.details.reason, /parameters\.0\.value/);
      return true;
    },
  );
});
