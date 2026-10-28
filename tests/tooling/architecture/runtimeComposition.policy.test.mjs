import assert from "node:assert/strict";
import test from "node:test";
import { checkArchitecture } from "../../../tooling/architecture/architecture.policy.mjs";
import { architectureFixture } from "./workspaceArchitecture.fixture.mjs";

test("legacy executable paths own composition but do not expose it to services or handlers", async (context) => {
  const root = "packages/runtime/src";
  const fixture = await architectureFixture(context, {
    [`${root}/database.composition.ts`]:
      'export const openDatabase = () => "database";',
    [`${root}/stdio-server.ts`]:
      'import { openDatabase } from "./database.composition.js"; openDatabase();',
    [`${root}/provision-user.ts`]:
      'import { openDatabase } from "./database.composition.js"; openDatabase();',
    [`${root}/provision-oauth-client.ts`]:
      'import { openDatabase } from "./database.composition.js"; openDatabase();',
    [`${root}/request.controller.ts`]:
      'import { openDatabase } from "./database.composition.js"; export const handle = openDatabase;',
    [`${root}/storage.service.ts`]:
      'import { openDatabase } from "./database.composition.js"; export const save = openDatabase;',
  });
  const findings = await checkArchitecture(fixture.root, fixture.projectPaths);
  for (const name of [
    "stdio-server",
    "provision-user",
    "provision-oauth-client",
  ]) {
    assert.deepEqual(
      findings.filter((f) => f.file === `${root}/${name}.ts`),
      [],
    );
  }
  for (const name of ["request.controller", "storage.service"]) {
    assert.ok(
      findings.some(
        (f) =>
          f.file === `${root}/${name}.ts` &&
          f.rule === "layer-boundary" &&
          f.target.endsWith("database.composition.ts"),
      ),
    );
  }
});
