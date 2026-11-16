import assert from "node:assert/strict";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { assertSourcePolicy } from "../../../dist/shared/utils/sourcePolicy.util.js";

test("source policy recognizes references across comments without matching literals", () => {
  for (const source of [
    "include /* comment */ <BOSL2/std.scad> cube(1);",
    'echo("import(\\"x\\")");',
    '// import("x")\ncube(1);',
    "/* use <bad> */ cube(1);",
    "import( /* empty */ );",
  ])
    assert.doesNotThrow(() => assertSourcePolicy(source));
  for (const source of [
    'import/**/("x");',
    '// comment\rsurface("x");',
    'surface /* comment */ (file="x");',
    "include/**/<../secret.scad>",
    "use <BOSL2/../secret.scad>",
    "include <unterminated",
    "import(".repeat(37000),
  ])
    assert.throws(() => assertSourcePolicy(source), {
      code: "FORBIDDEN_SOURCE_REFERENCE",
    });
});

test("maximum-size repeated call prefixes in comments have bounded scan time", () => {
  const url = new URL(
    "../../../dist/shared/utils/sourcePolicy.util.js",
    import.meta.url,
  ).href;
  const result = spawnSync(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      `
    import { assertSourcePolicy } from ${JSON.stringify(url)};
    for (let i = 0; i < 20; i++) assertSourcePolicy('cube(1); // ' + 'import('.repeat(37000));
  `,
    ],
    { timeout: 5_000, encoding: "utf8" },
  );
  assert.equal(result.status, 0, result.stderr || result.error?.message);
});
