import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { checkWorkspaceBoundaries } from "./check-package-boundaries.mjs";

const packageNames = ["contracts", "model-project", "renderer", "mcp", "gateway", "runtime"];

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "rjls-boundaries-"));
  for (const name of packageNames) {
    await mkdir(join(root, "packages", name, "src"), { recursive: true });
    await writeFile(join(root, "packages", name, "package.json"), JSON.stringify({ name: `@rjls/${name}`, dependencies: {} }));
    await writeFile(join(root, "packages", name, "src", "index.ts"), "export {};\n");
  }
  await mkdir(join(root, "apps", "site", "src"), { recursive: true });
  await writeFile(join(root, "apps", "site", "package.json"), JSON.stringify({ name: "@rjls/site", dependencies: { "@rjls/contracts": "workspace:*" } }));
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
  const testFindings = await findingsFor("packages/contracts/src/index.test.ts", 'import "node:test";\n');
  assert.deepEqual(testFindings, []);
  const runtimeFindings = await findingsFor("packages/contracts/src/index.ts", 'import "node:fs";\n');
  assert.ok(runtimeFindings.some((finding) => finding.includes("browser-safe contracts")));
});

test("rejects provider SDKs from browser-safe contracts", async () => {
  const findings = await findingsFor("packages/contracts/src/index.ts", 'import OpenAI from "openai";\nvoid OpenAI;\n');
  assert.ok(findings.some((finding) => finding.includes("server-only module")));
});

test("detects either client directive quote style and direct server imports", async () => {
  for (const quote of ['"', "'"]) {
    const findings = await findingsFor("apps/site/src/client.ts", `${quote}use client${quote};\nimport "@rjls/renderer";\n`);
    assert.ok(findings.some((finding) => finding.includes("client dependency")));
  }
});

test("traverses local imports from client entries and rejects bare Node built-ins", async () => {
  const root = await fixture();
  await writeFile(join(root, "apps/site/src/client.ts"), '"use client";\nimport "./helper";\n');
  await writeFile(join(root, "apps/site/src/helper.ts"), 'import "fs";\n');
  const findings = (await checkWorkspaceBoundaries(root)).findings;
  assert.ok(findings.some((finding) => finding.includes("imports server-only fs")));
});

test("rejects deep imports and server-only imports reachable from client code", async () => {
  const findings = await findingsFor(
    "packages/gateway/src/index.ts",
    'import "@rjls/mcp/src/index";\n',
    async (root) => writeFile(join(root, "apps/site/src/client.ts"), '"use client";\nimport "@rjls/gateway";\n'),
  );
  assert.ok(findings.some((finding) => finding.includes("deep-imports")));
  assert.ok(findings.some((finding) => finding.includes("client dependency")));
});

test("rejects gateway imports that bypass the MCP client boundary", async () => {
  const findings = await findingsFor("packages/gateway/src/index.ts", 'import { invokeCadTool } from "@rjls/mcp";\nvoid invokeCadTool;\n');
  assert.ok(findings.some((finding) => finding.includes("bypasses the MCP client boundary")));
});
