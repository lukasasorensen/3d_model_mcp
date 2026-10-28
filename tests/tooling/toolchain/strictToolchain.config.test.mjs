import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { ESLint } from "eslint";
import ts from "typescript";

const root = resolve(import.meta.dirname, "../../..");
const read = (path) => readFile(join(root, path), "utf8");
const config = (path) =>
  ts.getParsedCommandLineOfConfigFile(
    join(root, path),
    {},
    {
      ...ts.sys,
      onUnRecoverableConfigFileDiagnostic: (error) =>
        assert.fail(error.messageText),
    },
  );

test("local, CI, image and package runtime constraints agree on Node 24", async () => {
  const version = (await read(".node-version")).trim();
  assert.match(version, /^24\.\d+\.\d+$/);
  const manifest = JSON.parse(await read("package.json"));
  assert.equal(manifest.engines.node, ">=24 <25");
  assert.equal(manifest.packageManager, "pnpm@11.17.0");
  assert.match(
    await read(".github/workflows/ci.yml"),
    /node-version-file: ["']?\.node-version/,
  );
  const bases = [
    ...(await read("Dockerfile")).matchAll(/^FROM node:([^ ]+)/gm),
  ];
  assert.equal(bases.length, 2);
  assert.ok(bases.every(([, image]) => image === `${version}-bookworm-slim`));
});

test("library builds emit only source while workspace checks include mirrored tests", () => {
  const libraries = [
    "contracts",
    "browser-renderer",
    "runtime/model-project",
    "renderer",
    "mcp",
    "gateway",
    "runtime",
  ];
  for (const library of libraries) {
    const check = config(`packages/${library}/tsconfig.json`);
    const build = config(`packages/${library}/tsconfig.build.json`);
    assert.equal(check.options.noEmit, true, library);
    assert.ok(check.raw.include.includes("tests/**/*.ts"), library);
    assert.equal(build.options.noEmit, false, library);
    assert.equal(build.options.declaration, true, library);
    assert.ok(build.fileNames.length > 0, library);
    assert.ok(
      build.fileNames.every((file) =>
        file.startsWith(join(root, "packages", library, "src") + "/"),
      ),
      library,
    );
    assert.equal(
      build.options.moduleResolution,
      ts.ModuleResolutionKind.NodeNext,
      library,
    );
  }
  const site = config("apps/site/tsconfig.json");
  assert.equal(site.options.moduleResolution, ts.ModuleResolutionKind.Bundler);
  assert.ok(
    site.fileNames.some(
      (file) =>
        file.includes("/src/app/.well-known/") && file.endsWith("/route.ts"),
    ),
  );
  assert.ok(
    site.fileNames.some(
      (file) => file.includes("/tests/") && file.endsWith(".test.ts"),
    ),
  );
});

test("strict compiler rejects explicit undefined and unchecked indexed access", async () => {
  const directory = await mkdtemp(join(tmpdir(), "the31-strict-"));
  try {
    const file = join(directory, "strict.ts");
    await writeFile(
      file,
      'export const optional: { name?: string } = { name: undefined };\nexport const value: string = ["one"][2];\n',
    );
    const { options } = config("tsconfig.base.json");
    const program = ts.createProgram([file], { ...options, types: [] });
    const diagnostics = ts
      .getPreEmitDiagnostics(program)
      .filter((item) => item.file?.fileName === file);
    assert.ok(diagnostics.some((item) => item.code === 2375));
    assert.ok(diagnostics.some((item) => item.code === 2322));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("typed lint rejects floating promises, implicit returns and value-only type imports", async () => {
  const eslint = new ESLint({ cwd: root });
  const [result] = await eslint.lintText(
    'import { Stats } from "node:fs";\nexport function readSize(value: Stats) { Promise.resolve(); return value.size; }\n',
    {
      filePath: join(root, "apps/site/tests/accessibility.integration.test.ts"),
    },
  );
  const rules = new Set(result.messages.map((message) => message.ruleId));
  for (const rule of [
    "no-floating-promises",
    "explicit-function-return-type",
    "consistent-type-imports",
  ])
    assert.ok(rules.has(`@typescript-eslint/${rule}`), rule);
});
