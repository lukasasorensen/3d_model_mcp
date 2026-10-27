import assert from "node:assert/strict";
import test from "node:test";
import { checkArchitecture } from "../../../tooling/architecture/architecture.policy.mjs";
import { loadWorkspace } from "../../../tooling/architecture/workspaceSource.repository.mjs";
import { architectureFixture } from "./workspaceArchitecture.fixture.mjs";

const feature = "apps/site/src/features/preview";
const domain = "packages/domain/src/domains/cad";
const verify = async (fixture) =>
  checkArchitecture(fixture.root, fixture.projectPaths);
const has = (findings, file, rule, target) =>
  findings.some(
    (f) =>
      f.file === file &&
      f.rule === rule &&
      (!target || f.target.includes(target)),
  );

test("valid public re-exports, selected contracts, Next aliases, TSX and nested packages resolve directly to source", async (context) => {
  const fixture = await architectureFixture(context);
  assert.deepEqual(await verify(fixture), []);
  const workspace = loadWorkspace(fixture.root, fixture.projectPaths);
  assert.equal(
    workspace.owner(
      `${fixture.root}/packages/runtime/model-project/src/index.ts`,
    ).name,
    "@fixture/model-project",
  );
  assert.ok(
    [...workspace.publicEntries.values()].every(
      (file) => file.includes("/src/") && !file.includes("/dist/"),
    ),
  );
});

test("rejects peer services through named, type-only, namespace, dynamic and renamed barrel imports", async (context) => {
  const files = {
    [`${feature}/services/named.service.ts`]:
      'import { readModel as hidden } from "@fixture/domain"; export const a = hidden;',
    [`${feature}/services/typeOnly.service.ts`]:
      'import type { readModel } from "@fixture/domain"; export type Read = typeof readModel;',
    [`${feature}/services/namespace.service.ts`]:
      'import * as api from "@fixture/domain"; export const a = api.readModel;',
    [`${feature}/services/dynamic.service.ts`]:
      'export const a = () => import("@fixture/domain");',
    [`${feature}/services/importType.service.ts`]:
      'export type Read = typeof import("@fixture/domain").readModel;',
    [`${domain}/services/peer.service.ts`]:
      'import { readModel } from "./readModel.service.js"; export const b = readModel;',
    [`${domain}/index.ts`]:
      'export { readModel as aliased } from "./services/readModel.service.js";',
    [`${feature}/services/renamed.service.ts`]:
      'import { aliased } from "@fixture/domain"; export const a = aliased;',
  };
  // Keep the valid fixture's public contracts while adding the renamed export.
  files[`${domain}/index.ts`] +=
    ' export { readModel } from "./services/readModel.service.js"; export { normalizeShape } from "./utils/shape.util.js"; export type { Shape } from "./shape.types.js"; export type { ModelStore } from "./modelStore.port.js";';
  const findings = await verify(await architectureFixture(context, files));
  for (const file of Object.keys(files).filter((file) =>
    file.includes("/services/"),
  ))
    assert.ok(
      has(findings, file, "layer-boundary", "readModel.service.ts"),
      `${file}: ${JSON.stringify(findings)}`,
    );
});

test("rejects upward edges, controller peers, workflow peers and implementation-bearing contracts", async (context) => {
  const files = {
    [`${feature}/controllers/read.controller.ts`]:
      "export const read = () => 1;",
    [`${feature}/controllers/peer.controller.ts`]:
      'import { read } from "./read.controller.js"; export const peer = read;',
    [`${feature}/workflows/read.workflow.ts`]: "export const read = () => 1;",
    [`${feature}/workflows/peer.workflow.ts`]:
      'import { read } from "./read.workflow.js"; export const peer = read;',
    [`${feature}/utils/upward.util.ts`]:
      'import { preview } from "../services/preview.service.js"; export const upward = preview;',
    [`${feature}/wrong.port.ts`]:
      'import { preview } from "./services/preview.service.js"; export const wrong = preview;',
  };
  const findings = await verify(await architectureFixture(context, files));
  for (const name of [
    "controllers/peer.controller.ts",
    "workflows/peer.workflow.ts",
    "utils/upward.util.ts",
    "wrong.port.ts",
  ])
    assert.ok(has(findings, `${feature}/${name}`, "layer-boundary"), name);
  assert.ok(
    has(findings, `${feature}/wrong.port.ts`, "contract-implementation"),
  );
});

test("rejects deep/alias imports and forbidden module dependencies, including infrastructure services", async (context) => {
  const files = {
    [`${feature}/services/deep.service.ts`]:
      'import { readModel } from "../../../../../../packages/domain/src/domains/cad/services/readModel.service.js"; export const a = readModel;',
    [`${feature}/utils/alias.util.ts`]:
      'import { preview } from "@/features/preview/services/preview.service"; export const a = preview;',
    "packages/domain/src/infrastructure/services/store.service.ts":
      "export const store = () => 1;",
    "packages/domain/src/infrastructure/index.ts":
      'export { store } from "./services/store.service.js";',
    [`${domain}/services/concrete.service.ts`]:
      'import { store } from "../../../infrastructure/index.js"; export const a = store;',
    "packages/domain/src/features/edit/index.ts":
      'export { edit } from "./services/edit.service.js";',
    "packages/domain/src/features/edit/services/edit.service.ts":
      "export const edit = () => 1;",
    [`${domain}/utils/feature.util.ts`]:
      'import { edit } from "../../../features/edit/index.js"; export const a = edit;',
    "packages/domain/src/shared/utils/violation.util.ts":
      'import { readModel } from "../../domains/cad/index.js"; export const a = readModel;',
    "packages/domain/src/infrastructure/services/violation.service.ts":
      'import { readModel } from "../../domains/cad/index.js"; export const a = readModel;',
    [`${domain}/utils/own.util.ts`]:
      'import type { Shape } from "../index.js"; export type S = Shape;',
  };
  const findings = await verify(await architectureFixture(context, files));
  assert.ok(has(findings, `${feature}/services/deep.service.ts`, "public-api"));
  assert.ok(has(findings, `${feature}/utils/alias.util.ts`, "layer-boundary"));
  for (const file of [
    `${domain}/services/concrete.service.ts`,
    `${domain}/utils/feature.util.ts`,
    "packages/domain/src/shared/utils/violation.util.ts",
    "packages/domain/src/infrastructure/services/violation.service.ts",
  ])
    assert.ok(has(findings, file, "module-boundary"), file);
  assert.ok(
    has(
      findings,
      `${domain}/services/concrete.service.ts`,
      "layer-boundary",
      "store.service",
    ),
  );
  assert.ok(has(findings, `${domain}/utils/own.util.ts`, "own-barrel"));
});

test("rejects type-only file cycles, conceptual module cycles, unresolved imports, nonliteral imports and require", async (context) => {
  const files = {
    [`${domain}/utils/a.util.ts`]:
      'import type { B } from "./b.util.js"; export type A = { b: B };',
    [`${domain}/utils/b.util.ts`]:
      'import type { A } from "./a.util.js"; export type B = { a: A };',
    [`${domain}/utils/missing.util.ts`]:
      'import { no } from "./missing.js"; export const a = no;',
    [`${domain}/utils/dynamic.util.ts`]:
      "export const load = (name: string) => import(name);",
    [`${domain}/utils/require.util.ts`]: 'export const a = require("node:fs");',
    "packages/domain/src/domains/other/index.ts":
      'export type { Other } from "./other.types.js";',
    "packages/domain/src/domains/other/other.types.ts":
      "export interface Other { id: string }",
    "packages/domain/src/domains/other/uses.types.ts":
      'import type { Shape } from "../cad/index.js"; export type Used = Shape;',
    [`${domain}/uses.types.ts`]:
      'import type { Other } from "../other/index.js"; export type Used = Other;',
  };
  const findings = await verify(await architectureFixture(context, files));
  assert.ok(has(findings, `${domain}/utils/a.util.ts`, "file-cycle"));
  assert.ok(findings.some((f) => f.rule === "graph-no-cycles"));
  assert.ok(findings.some((f) => f.rule === "module-cycle"));
  assert.ok(
    has(findings, `${domain}/utils/missing.util.ts`, "unresolved-import"),
  );
  assert.ok(
    has(
      findings,
      `${domain}/utils/missing.util.ts`,
      "graph-no-unresolved-imports",
    ),
  );
  assert.ok(has(findings, `${domain}/utils/dynamic.util.ts`, "dynamic-import"));
  assert.ok(has(findings, `${domain}/utils/require.util.ts`, "esm-only"));
});

test("tracks aliases and workers through browser graphs but excludes erased type-only edges", async (context) => {
  const files = {
    [`${feature}/components/view.component.tsx`]:
      '"use client"; import { read } from "@/features/preview/utils/server.util"; new Worker(new URL("../workers/preview.worker.ts", import.meta.url)); export const View = () => <div>{typeof read}</div>;',
    [`${feature}/utils/server.util.ts`]:
      'import { readFile } from "node:fs"; export const read = readFile;',
    [`${feature}/workers/preview.worker.ts`]:
      'import { homedir } from "node:os"; export const home = homedir;',
    [`${feature}/components/safe.component.tsx`]:
      '"use client"; import type { read } from "../utils/server.util.js"; export type Read = typeof read; export const Safe = () => <div />;',
  };
  const findings = await verify(await architectureFixture(context, files));
  assert.ok(
    has(
      findings,
      `${feature}/components/view.component.tsx`,
      "browser-server",
      "node:fs",
    ),
  );
  assert.ok(
    has(
      findings,
      `${feature}/components/view.component.tsx`,
      "browser-server",
      "node:os",
    ),
  );
  assert.ok(
    !has(
      findings,
      `${feature}/components/safe.component.tsx`,
      "browser-server",
    ),
  );
});

test("legacy implementation-bearing barrels cannot hide peer capabilities from new consumers", async (context) => {
  const findings = await verify(
    await architectureFixture(context, {
      "packages/runtime/src/index.ts":
        "export const read = () => 1; export interface Context { id: string }",
      [`${feature}/services/bypass.service.ts`]:
        'import { read } from "@fixture/runtime"; export const bypass = read;',
      [`${feature}/services/contracts.service.ts`]:
        'import type { Context } from "@fixture/runtime"; export const identity = (context: Context) => context.id;',
    }),
  );
  assert.ok(
    has(
      findings,
      `${feature}/services/bypass.service.ts`,
      "layer-boundary",
      "runtime/src/index.ts",
    ),
  );
  assert.ok(
    !has(
      findings,
      `${feature}/services/contracts.service.ts`,
      "layer-boundary",
    ),
  );
});

test("workspace aliases cannot redirect public imports to internals, and stale declarations cannot mask service origins", async (context) => {
  const findings = await verify(
    await architectureFixture(context, {
      "apps/site/tsconfig.json": JSON.stringify({
        compilerOptions: {
          module: "ESNext",
          moduleResolution: "Bundler",
          jsx: "preserve",
          paths: {
            "@/*": ["./src/*"],
            "@fixture/domain": [
              "../../packages/domain/src/domains/cad/services/readModel.service.ts",
            ],
          },
        },
        include: ["src/**/*"],
      }),
      "packages/domain/dist/index.d.ts":
        "export declare const readModel: string;",
      "packages/runtime/src/services/stale.service.ts":
        'import { readModel } from "@fixture/domain"; export const a = readModel;',
      [`${feature}/services/redirect.service.ts`]:
        'import { readModel } from "@fixture/domain"; export const a = readModel;',
    }),
  );
  assert.ok(
    has(findings, `${feature}/services/redirect.service.ts`, "public-api"),
  );
  assert.ok(
    has(findings, `${feature}/services/redirect.service.ts`, "layer-boundary"),
  );
  assert.ok(
    has(
      findings,
      "packages/runtime/src/services/stale.service.ts",
      "layer-boundary",
      "readModel.service.ts",
    ),
  );
});

test("shared contracts pass through a package barrel, while internal modules cannot import their package's own barrel", async (context) => {
  const shared = {
    "packages/domain/src/index.ts":
      'export * from "./domains/cad/index.js"; export type { Shared } from "./shared/types/shared.types.js";',
    "packages/domain/src/shared/types/shared.types.ts":
      "export interface Shared { id: string }",
    "apps/site/src/shared/types/consumer.types.ts":
      'import type { Shared } from "@fixture/domain"; export type Consumer = Shared;',
  };
  assert.deepEqual(
    await verify(await architectureFixture(context, shared)),
    [],
  );
  const file = `${domain}/services/ownPublic.service.ts`;
  const findings = await verify(
    await architectureFixture(context, {
      ...shared,
      [file]:
        'import type { Shape } from "@fixture/domain"; export const identity = (shape: Shape) => shape;',
    }),
  );
  assert.ok(has(findings, file, "own-barrel", "packages/domain/src/index.ts"));
});

test("schema-inferred contracts use erased validation metadata, never service implementations", async (context) => {
  const files = {
    [`${domain}/shape.schema.ts`]:
      "export const shapeSchema = { parse: (input: unknown) => input };",
    [`${domain}/version.constants.ts`]: "export const VERSION = '1' as const;",
    [`${domain}/shape.types.ts`]:
      'import type { shapeSchema } from "./shape.schema.js"; import type { VERSION } from "./version.constants.js"; export interface Shape { id: string }; export type Output = ReturnType<typeof shapeSchema.parse>; export type Version = typeof VERSION;',
    [`${domain}/forbidden.port.ts`]:
      'import type { readModel } from "./services/readModel.service.js"; export type Read = typeof readModel;',
  };
  const findings = await verify(await architectureFixture(context, files));
  assert.ok(!has(findings, `${domain}/shape.types.ts`, "layer-boundary"));
  assert.ok(has(findings, `${domain}/forbidden.port.ts`, "layer-boundary"));
});

test("unclassified legacy callers still fail classification but can consume already valid foundations", async (context) => {
  const file = `${feature}/legacy.ts`;
  const findings = await verify(
    await architectureFixture(context, {
      [file]:
        'import type { Shape } from "@fixture/domain"; export type Legacy = Shape;',
    }),
  );
  assert.ok(has(findings, file, "unknown-layer"));
  assert.ok(!has(findings, file, "layer-boundary"));
});

test("only the two declared legacy host bootstraps can construct public renderer factories", async (context) => {
  const entry =
    'import { createRenderer } from "@fixture/runtime"; export const renderer = createRenderer();';
  const findings = await verify(
    await architectureFixture(context, {
      "packages/runtime/src/index.ts":
        'export { createRenderer } from "./renderer.factory.js";',
      "packages/runtime/src/renderer.factory.ts":
        "export const createRenderer = () => ({ ready: true });",
      "apps/site/src/lib/cad-renderer.adapter.ts": entry,
      "apps/site/src/lib/openscad.worker.ts": entry,
      "apps/site/src/lib/other.adapter.ts": entry,
    }),
  );
  assert.ok(
    !has(
      findings,
      "apps/site/src/lib/cad-renderer.adapter.ts",
      "layer-boundary",
    ),
  );
  assert.ok(
    !has(findings, "apps/site/src/lib/openscad.worker.ts", "layer-boundary"),
  );
  assert.ok(
    has(findings, "apps/site/src/lib/other.adapter.ts", "layer-boundary"),
  );
});

test("the declared runtime asset is resolved without enabling arbitrary dynamic worker imports", async (context) => {
  const findings = await verify(
    await architectureFixture(context, {
      "packages/runtime/package.json": JSON.stringify({
        name: "@theoryfoundry/browser-renderer",
        type: "module",
        exports: {
          ".": { types: "./dist/index.d.ts", import: "./dist/index.js" },
        },
      }),
      "packages/runtime/src/services/asset.service.ts":
        'export const load = (origin: string) => import(new URL("/vendor/openscad/openscad.js", origin).href);',
      "packages/runtime/src/services/unknown.service.ts":
        'export const load = (origin: string) => import(new URL("/vendor/unknown.js", origin).href);',
    }),
  );
  assert.ok(
    !has(
      findings,
      "packages/runtime/src/services/asset.service.ts",
      "dynamic-import",
    ),
  );
  assert.ok(
    has(
      findings,
      "packages/runtime/src/services/unknown.service.ts",
      "dynamic-import",
    ),
  );
});
