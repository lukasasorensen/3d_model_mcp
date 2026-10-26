import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

export async function architectureFixture(context, changes = {}) {
  const root = await mkdtemp(join(tmpdir(), "workspace-architecture-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const projectPaths = [
    "packages/domain",
    "apps/site",
    "packages/runtime",
    "packages/runtime/model-project",
  ];
  const files = {
    "packages/domain/src/index.ts": 'export * from "./domains/cad/index.js";',
    "packages/domain/src/domains/cad/index.ts":
      'export { readModel } from "./services/readModel.service.js"; export { normalizeShape } from "./utils/shape.util.js"; export type { Shape } from "./shape.types.js"; export type { ModelStore } from "./modelStore.port.js";',
    "packages/domain/src/domains/cad/shape.types.ts":
      "export interface Shape { name: string }",
    "packages/domain/src/domains/cad/modelStore.port.ts":
      'import type { Shape } from "./shape.types.js"; export interface ModelStore { read(): Shape }',
    "packages/domain/src/domains/cad/utils/shape.util.ts":
      "export const normalizeShape = (name: string) => name.trim();",
    "packages/domain/src/domains/cad/services/readModel.service.ts":
      'import type { ModelStore } from "../modelStore.port.js"; import { normalizeShape } from "../utils/shape.util.js"; export const readModel = (store: ModelStore) => normalizeShape(store.read().name);',
    "apps/site/src/features/preview/services/preview.service.ts":
      'import type { ModelStore, Shape } from "@fixture/domain"; import { normalizeShape as normalize } from "@fixture/domain"; export const preview = (store: ModelStore): Shape => ({ name: normalize(store.read().name) });',
    "apps/site/src/features/preview/index.ts":
      'export { preview } from "./services/preview.service.js";',
    "apps/site/src/app/page.tsx":
      'import { preview } from "@/features/preview"; export default function Page() { return <div>{typeof preview}</div>; }',
    "packages/runtime/src/index.ts":
      'export type { Runtime } from "./runtime.types.js";',
    "packages/runtime/src/runtime.types.ts":
      "export interface Runtime { ready: boolean }",
    "packages/runtime/model-project/src/index.ts":
      'export type { Project } from "./project.types.js";',
    "packages/runtime/model-project/src/project.types.ts":
      "export interface Project { id: string }",
  };
  for (const directory of projectPaths) {
    const name =
      directory === "apps/site" ? "site" : directory.split("/").at(-1);
    files[`${directory}/package.json`] = JSON.stringify({
      name: `@fixture/${name}`,
      type: "module",
      exports: {
        ".": { types: "./dist/index.d.ts", import: "./dist/index.js" },
      },
    });
    if (directory === "apps/site")
      files[`${directory}/package.json`] = JSON.stringify({
        name: "@fixture/site",
        type: "module",
      });
    files[`${directory}/tsconfig.json`] = JSON.stringify({
      compilerOptions: {
        rootDir: "src",
        outDir: "dist",
        module: directory === "apps/site" ? "ESNext" : "NodeNext",
        moduleResolution: directory === "apps/site" ? "Bundler" : "NodeNext",
        jsx: "preserve",
        paths: { "@/*": ["./src/*"] },
      },
      include: ["src/**/*"],
    });
  }
  for (const [file, source] of Object.entries({ ...files, ...changes })) {
    await mkdir(dirname(join(root, file)), { recursive: true });
    await writeFile(join(root, file), source);
  }
  return { root, projectPaths };
}
