import test from "node:test";
import assert from "node:assert/strict";
import {
  BROWSER_RENDERER,
  CAD_LIMITS,
  revisionManifestSchema,
  parameterSnapshotSchema,
} from "@theoryfoundry/contracts";
import {
  createCadToolRegistry,
  invokeCadTool,
} from "../../../../dist/index.js";

const parameters = parameterSnapshotSchema.parse(
  Array.from({ length: 50 }, (_, index) => ({
    id: `p${index}`,
    binding: `p${index}`,
    label: `Parameter ${index}`,
    description: "x".repeat(2000),
    type: "number",
    defaultValue: 20,
    value: 20,
  })),
);
const source = `// theoryfoundry:parameters:start v1\n${parameters.map((p) => `${p.binding}=20;`).join("\n")}\n// theoryfoundry:parameters:end\ncube(p0);`;
const revisions = Array.from({ length: 6 }, (_, index) =>
  revisionManifestSchema.parse({
    version: "1",
    projectId: "history",
    revisionId: `revision-${index}`,
    parentRevision: index ? `revision-${index - 1}` : null,
    sourceHash: "1".repeat(64),
    sourceBytes: source.length,
    createdAt: "2026-11-12T00:00:00Z",
    requestId: `request-${index}`,
    toolCallId: "tool",
    candidateId: `candidate-${index}`,
    validationPolicyVersion: "v1",
    validationResult: "VALID",
    diagnostics: [],
    artifacts: [],
    parameters,
    renderer: {
      profile: "browser-wasm",
      renderer: "openscad-wasm",
      rendererVersion: "1.0.0",
      openscadVersion: BROWSER_RENDERER.openscadVersion,
      openscadWasmHash: `sha256:${BROWSER_RENDERER.openscadWasmSha256}`,
      openscadGlueHash: `sha256:${BROWSER_RENDERER.openscadGlueSha256}`,
      bosl2Version: BROWSER_RENDERER.bosl2Version,
      bosl2Digest: `sha256:${BROWSER_RENDERER.bosl2ArchiveSha256}`,
      backend: BROWSER_RENDERER.backend,
      commandPolicyVersion: "v1",
      validationPolicyVersion: "v1",
    },
  }),
);
const registry = createCadToolRegistry({
  listRevisions: async () => revisions,
  readModelSource: async (_projectId, revision) => ({
    revision,
    source,
    sourceHash: "1".repeat(64),
    parameters,
  }),
});

test("MCP revision history does not multiply large parameter snapshots past the response limit", async () => {
  assert.ok(
    Buffer.byteLength(JSON.stringify({ revisions })) >
      CAD_LIMITS.toolResultBytes,
  );
  const result = await invokeCadTool(registry, "list_revisions", {
    projectId: "history",
  });
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.value.revisions.length, 6);
  assert.ok(
    result.value.revisions.every(
      (revision) => !Object.hasOwn(revision, "parameters"),
    ),
  );
  assert.ok(
    Buffer.byteLength(JSON.stringify(result.value)) <
      CAD_LIMITS.toolResultBytes,
  );
  assert.equal(
    revisions[0].parameters.length,
    50,
    "Projection must not mutate stored snapshots",
  );
});

test("MCP source reads expose the full snapshot for a selected historical revision", async () => {
  const result = await invokeCadTool(registry, "read_model_source", {
    projectId: "history",
    revision: "revision-2",
  });
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.value.model.revision, "revision-2");
  assert.equal(result.value.model.source, source);
  assert.deepEqual(result.value.model.parameters, parameters);
});
