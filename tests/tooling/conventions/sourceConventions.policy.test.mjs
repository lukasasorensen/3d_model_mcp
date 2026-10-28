import assert from "node:assert/strict";
import test from "node:test";
import {
  inspectSource,
  isExcluded,
  namingViolations,
  physicalLines,
} from "../../../tooling/conventions/sourceConventions.policy.mjs";

test("counts physical lines at the 500/501 boundary, including blank lines", async () => {
  for (const ending of ["", "\n"]) {
    const source = Array(500).fill("// intent").join("\n") + ending;
    assert.equal(physicalLines(source), 500);
    assert.equal(
      (await inspectSource("src/example.util.ts", source)).maxLines,
      undefined,
    );
    assert.equal(
      (await inspectSource("src/example.util.ts", source + "\n// extra"))
        .maxLines,
      ending ? 502 : 501,
    );
  }
  assert.equal(physicalLines(""), 0);
  assert.equal(physicalLines("\n"), 1);
  assert.equal(
    (await inspectSource("docs/example.md", "\n".repeat(501))).maxLines,
    501,
  );
});

test("requires roles, camelCase, kebab-case folders, mirrored tests and matching layers", () => {
  assert.deepEqual(
    namingViolations(
      "packages/example/src/domains/a-domain/services/readModel.service.ts",
    ),
    [],
  );
  assert.deepEqual(
    namingViolations("tests/tooling/testing/testDiscovery.service.test.mjs"),
    [],
  );
  assert.deepEqual(
    namingViolations("apps/site/src/app/projects/[id]/page.tsx"),
    [],
  );
  assert.deepEqual(
    namingViolations("apps/site/src/app/(private)/layout.tsx"),
    [],
  );
  assert.deepEqual(namingViolations("apps/site/next.config.mjs"), []);
  assert.deepEqual(namingViolations("src/services/read-model.ts"), [
    "filename",
    "layer-suffix",
  ]);
  assert.deepEqual(namingViolations("src/services/readModel.util.ts"), [
    "layer-suffix",
  ]);
  assert.deepEqual(
    namingViolations("src/BadFolder/readModel.service.test.ts"),
    ["folder", "test-placement"],
  );
});

test("exempts exact generated artifacts, not similarly named handwritten files", async () => {
  const source = "not formatted";
  assert.deepEqual(
    await inspectSource(
      "apps/site/public/installers/connect-codex-v1.mjs",
      source,
    ),
    {},
  );
  assert.deepEqual(await inspectSource("pnpm-lock.yaml", source), {});
  assert.equal(
    isExcluded("apps/site/public/vendor/openscad/openscad.js"),
    true,
  );
  assert.equal(
    isExcluded("packages/runtime/model-project/drizzle/0000_schema.sql"),
    true,
  );
  assert.equal(
    isExcluded("packages/runtime/model-project/drizzle/meta/_journal.json"),
    true,
  );
  assert.equal(
    isExcluded("packages/runtime/model-project/drizzle/readSchema.util.ts"),
    false,
  );
  assert.equal(isExcluded("src/vendor/readModel.service.ts"), false);
  await assert.rejects(inspectSource("tooling/example.generated.mjs", source));
  assert.ok(
    (await inspectSource("src/example.util.ts", "export const x=1")).formatHash,
  );
  assert.equal(
    (await inspectSource("src/example.util.ts", "export const x = 1;\n"))
      .formatHash,
    undefined,
  );
});

test("preserves root well-known route URLs without exempting ordinary folders", () => {
  for (const route of [
    "oauth-protected-resource",
    "oauth-protected-resource/mcp",
    "oauth-authorization-server/api/auth",
  ]) {
    assert.deepEqual(
      namingViolations(`apps/site/src/app/.well-known/${route}/route.ts`),
      [],
    );
  }
  for (const file of [
    "apps/site/src/features/.well-known/discovery.util.ts",
    "apps/site/src/app/nested/.well-known/route.ts",
    "apps/site/src/app/.well-known/discovery.util.ts",
    "apps/site/src/app/.private/route.ts",
    "apps/site/src/app/.well-known/BadFolder/route.ts",
  ]) {
    assert.ok(namingViolations(file).includes("folder"), file);
  }
});
