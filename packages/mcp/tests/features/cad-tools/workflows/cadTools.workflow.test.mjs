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

test("generated source reads expose body and JSON once while retaining the assembled source hash", async () => {
  const body = "//" + "x".repeat(180 * 1024) + "\ncube(p0);";
  const generatedRegistry = createCadToolRegistry({
    readModelSource: async () => ({
      revision: "generated",
      source: source + body,
      modelBody: body,
      parameters,
      sourceHash: "2".repeat(64),
    }),
  });
  const result = await invokeCadTool(generatedRegistry, "read_model_source", {
    projectId: "demo",
    revision: "generated",
  });
  assert.equal(result.ok, true);
  assert.equal(result.value.model.modelBody, body);
  assert.equal(result.value.model.source, undefined);
  assert.equal(result.value.model.sourceHash, "2".repeat(64));
  assert.deepEqual(result.value.model.parameters, parameters);
});

test("large generated documents return compact mutation metadata after proposal, validation, promotion and restore", async () => {
  const expectedParameters = parameters.toSorted((a, b) =>
    a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
  );
  const { ModelProjectRepository, VALIDATION_POLICY_VERSION } =
    await import("@theoryfoundry/model-project");
  const { mkdtemp, rm } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const workspaceRoot = await mkdtemp(
    join(tmpdir(), "pr65-metadata-regression-"),
  );
  const modelBody = "/*" + '"'.repeat(220 * 1024) + "*/ cube(p0);";
  const provenance = {
    ...revisions[0].renderer,
    validationPolicyVersion: VALIDATION_POLICY_VERSION,
  };
  const repository = new ModelProjectRepository({
    workspaceRoot,
    acceptRendererProvenance: () => true,
    renderer: {
      validateAndRender: async () => ({
        outcome: "VALID",
        diagnostics: [],
        provenance,
        validationPolicyVersion: VALIDATION_POLICY_VERSION,
        artifacts: [],
      }),
    },
  });
  const tools = createCadToolRegistry(repository);
  async function invoke(name, input) {
    const result = await invokeCadTool(tools, name, input);
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.ok(
      Buffer.byteLength(JSON.stringify(result.value)) <=
        CAD_LIMITS.toolResultBytes,
    );
    const record = result.value.candidate ?? result.value.revision;
    assert.equal(Object.hasOwn(record, "modelBody"), false);
    assert.deepEqual(record.parameters, expectedParameters);
    return record;
  }
  try {
    const { projectId } = await repository.createProject({
      name: "Large generated body",
      description: "Compact mutation response regression",
    });
    const proposal = {
      projectId,
      parentRevision: null,
      modelBody,
      parameters,
      requestId: "large",
      toolCallId: "large",
    };
    const candidate = await invoke("propose_model_source", proposal);
    const stored = await repository.getCandidate(
      projectId,
      candidate.candidateId,
    );
    assert.ok(stored.sourceBytes < CAD_LIMITS.sourceBytes);
    assert.ok(
      Buffer.byteLength(JSON.stringify(stored.parameters)) < 128 * 1024,
    );
    assert.ok(
      Buffer.byteLength(JSON.stringify({ candidate: stored })) >
        CAD_LIMITS.toolResultBytes,
    );
    assert.equal(stored.modelBody, modelBody);
    assert.equal(
      (await invoke("propose_model_source", proposal)).candidateId,
      candidate.candidateId,
    );
    assert.equal(
      (
        await invoke("validate_and_render", {
          projectId,
          candidateId: candidate.candidateId,
          previewProfile: "standard",
        })
      ).state,
      "VALID",
    );
    const first = await invoke("promote_candidate", {
      projectId,
      candidateId: candidate.candidateId,
      expectedParentRevision: null,
    });
    assert.equal(
      (await repository.getProjectState(projectId)).currentRevision,
      first.revisionId,
    );
    const restored = await invoke("restore_revision", {
      projectId,
      revision: first.revisionId,
      requestId: "restore",
      toolCallId: "restore",
    });
    assert.notEqual(restored.revisionId, first.revisionId);
    assert.equal(restored.parentRevision, first.revisionId);
    assert.equal(
      (await repository.getProjectState(projectId)).currentRevision,
      restored.revisionId,
    );
    for (const revision of [first.revisionId, restored.revisionId]) {
      const model = await repository.readModelSource(projectId, revision);
      assert.equal(model.modelBody, modelBody);
      assert.ok(model.source.endsWith(modelBody));
      assert.equal(model.sourceHash, candidate.sourceHash);
      assert.deepEqual(model.parameters, expectedParameters);
    }
    assert.ok(
      (await repository.listRevisions(projectId)).every(
        (revision) => revision.modelBody === modelBody,
      ),
    );
  } finally {
    await rm(workspaceRoot, { recursive: true, force: true });
  }
});
