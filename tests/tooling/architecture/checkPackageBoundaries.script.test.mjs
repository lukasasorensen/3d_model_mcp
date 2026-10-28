import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { checkWorkspaceBoundaries } from "../../../tooling/architecture/checkPackageBoundaries.script.mjs";

const packageNames = [
  "local-worker",
  "worker-auth",
  "contracts",
  "browser-renderer",
  "model-project",
  "renderer",
  "mcp",
  "gateway",
  "runtime",
];

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "theoryfoundry-boundaries-"));
  for (const name of packageNames) {
    await mkdir(join(root, "packages", name, "src"), { recursive: true });
    await writeFile(
      join(root, "packages", name, "package.json"),
      JSON.stringify({ name: `@theoryfoundry/${name}`, dependencies: {} }),
    );
    await writeFile(
      join(root, "packages", name, "src", "index.ts"),
      "export {};\n",
    );
  }
  await mkdir(join(root, "apps", "site", "src"), { recursive: true });
  await writeFile(
    join(root, "apps", "site", "package.json"),
    JSON.stringify({
      name: "@theoryfoundry/site",
      dependencies: { "@theoryfoundry/contracts": "workspace:*" },
    }),
  );
  return root;
}

async function findingsFor(path, source, mutateManifest) {
  const root = await fixture();
  const file = join(root, path);
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, source);
  if (mutateManifest) await mutateManifest(root);
  return (await checkWorkspaceBoundaries(root)).findings;
}

test("allows Node built-ins in contract tests but rejects them at browser runtime", async () => {
  const testFindings = await findingsFor(
    "packages/contracts/src/index.test.ts",
    'import "node:test";\n',
  );
  assert.deepEqual(testFindings, []);
  const runtimeFindings = await findingsFor(
    "packages/contracts/src/index.ts",
    'import "node:fs";\n',
  );
  assert.ok(
    runtimeFindings.some((finding) =>
      finding.includes("browser-safe contracts"),
    ),
  );
});

test("rejects provider SDKs from browser-safe contracts", async () => {
  const findings = await findingsFor(
    "packages/contracts/src/index.ts",
    'import OpenAI from "openai";\nvoid OpenAI;\n',
  );
  assert.ok(findings.some((finding) => finding.includes("server-only module")));
});

test("detects either client directive quote style and direct server imports", async () => {
  for (const quote of ['"', "'"]) {
    const findings = await findingsFor(
      "apps/site/src/client.ts",
      `${quote}use client${quote};\nimport "@theoryfoundry/renderer";\n`,
    );
    assert.ok(
      findings.some((finding) => finding.includes("client dependency")),
    );
  }
});

test("traverses local imports from client entries and rejects bare Node built-ins", async () => {
  const root = await fixture();
  await writeFile(
    join(root, "apps/site/src/client.ts"),
    '"use client";\nimport "./helper";\n',
  );
  await writeFile(join(root, "apps/site/src/helper.ts"), 'import "fs";\n');
  const findings = (await checkWorkspaceBoundaries(root)).findings;
  assert.ok(
    findings.some((finding) => finding.includes("imports server-only fs")),
  );
});

test("traverses extensionless imports whose filenames contain a role suffix", async () => {
  const root = await fixture();
  await writeFile(
    join(root, "apps/site/src/client.ts"),
    '"use client";\nimport "./renderer.adapter";\n',
  );
  await writeFile(
    join(root, "apps/site/src/renderer.adapter.ts"),
    'import "node:fs";\n',
  );
  const findings = (await checkWorkspaceBoundaries(root)).findings;
  assert.ok(
    findings.some((finding) =>
      finding.includes("renderer.adapter.ts imports server-only node:fs"),
    ),
  );
});

test("rejects deep imports and server-only imports reachable from client code", async () => {
  const findings = await findingsFor(
    "packages/gateway/src/index.ts",
    'import "@theoryfoundry/mcp/src/index";\n',
    async (root) =>
      writeFile(
        join(root, "apps/site/src/client.ts"),
        '"use client";\nimport "@theoryfoundry/gateway";\n',
      ),
  );
  assert.ok(findings.some((finding) => finding.includes("deep-imports")));
  assert.ok(findings.some((finding) => finding.includes("client dependency")));
});

test("rejects gateway imports that bypass the MCP client boundary", async () => {
  const findings = await findingsFor(
    "packages/gateway/src/index.ts",
    'import { invokeCadTool } from "@theoryfoundry/mcp";\nvoid invokeCadTool;\n',
  );
  assert.ok(
    findings.some((finding) =>
      finding.includes("bypasses the MCP client boundary"),
    ),
  );
});

test("shared browser renderer permits contracts and rejects Node, site, and server dependencies", async () => {
  assert.deepEqual(
    await findingsFor(
      "packages/browser-renderer/src/index.ts",
      'import "@theoryfoundry/contracts";\n',
    ),
    [],
  );
  for (const dependency of [
    "node:fs",
    "next/headers",
    "@theoryfoundry/runtime",
  ]) {
    const findings = await findingsFor(
      "packages/browser-renderer/src/index.ts",
      `import "${dependency}";\n`,
    );
    assert.ok(findings.length > 0, dependency);
  }
});

test("browser renderer cannot acquire a server dependency through its manifest", async () => {
  const findings = await findingsFor(
    "packages/browser-renderer/src/index.ts",
    "export {};\n",
    async (root) => {
      await writeFile(
        join(root, "packages/browser-renderer/package.json"),
        JSON.stringify({
          dependencies: { "@theoryfoundry/renderer": "workspace:*" },
        }),
      );
    },
  );
  assert.ok(findings.some((finding) => finding.includes("not browser-safe")));
});

test("worker credentials cannot enter browser code or depend on hosted persistence", async () => {
  const browser = await findingsFor(
    "apps/site/src/client.ts",
    '"use client";\nimport "@theoryfoundry/worker-auth";\n',
  );
  assert.ok(browser.some((finding) => finding.includes("client dependency")));
  const database = await findingsFor(
    "packages/worker-auth/src/index.ts",
    'import "@theoryfoundry/model-project";\n',
  );
  assert.ok(
    database.some((finding) =>
      finding.includes("worker-auth cannot depend on model-project"),
    ),
  );
});
