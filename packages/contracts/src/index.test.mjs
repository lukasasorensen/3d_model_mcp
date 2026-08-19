import assert from "node:assert/strict";
import test from "node:test";
import {
  CAD_LIMITS,
  CHAT_LIMITS,
  CONTRACT_VERSION,
  PRODUCT_ID,
  artifactManifestSchema,
  chatEventSchema,
  chatRequestSchema,
  createEnvelope,
  isProductionRendererProvenance,
  localMcpBrowserRenderJobSchema,
  projectIdSchema,
  proposeModelSourceInputSchema,
  rendererProvenanceSchema,
} from "../dist/index.js";

test("creates a versioned browser-safe envelope", () => {
  assert.deepEqual(createEnvelope("foundation.ready", { service: "runtime" }), {
    version: CONTRACT_VERSION,
    type: "foundation.ready",
    payload: { service: "runtime" },
  });
  assert.equal(PRODUCT_ID, "3d_model_mcp");
});

test("validates the strict browser-safe chat v3 contract", () => {
  assert.equal(chatRequestSchema.safeParse({ version: "3", projectId: "project-1", sessionId: "session-1", message: "Create a bracket" }).success, true);
  assert.equal(chatRequestSchema.safeParse({ version: "3", projectId: "project-1", sessionId: "session-1", message: "ok", promptPath: "/secret" }).success, false);
  const base = { version: "3", requestId: "request-1", sessionId: "session-1", sequence: 0, timestamp: "2026-08-05T12:00:00.000Z" };
  assert.equal(chatEventSchema.safeParse({ ...base, type: "assistant_delta", delta: "ready" }).success, true);
  assert.equal(chatEventSchema.safeParse({ ...base, type: "revision", status: "current", toolCallId: "tool-1" }).success, false);
  assert.equal(chatEventSchema.safeParse({ ...base, type: "unknown", source: "cube(1);" }).success, false);
  assert.equal(chatEventSchema.safeParse({ ...base, type: "assistant_delta", delta: "x".repeat(CHAT_LIMITS.assistantDeltaCharacters + 1) }).success, false);
});

test("validates source-bound local MCP browser jobs", () => {
  const job = {
    version: "1", jobId: "local-render-1", projectId: "demo-project", candidateId: "candidate-1",
    token: "a".repeat(64), source: "cube(1);", sourceHash: "b".repeat(64), format: "stl",
    createdAt: "2026-08-18T12:00:00.000Z", deadline: "2026-08-18T12:01:00.000Z",
  };
  assert.equal(localMcpBrowserRenderJobSchema.safeParse(job).success, true);
  assert.equal(localMcpBrowserRenderJobSchema.safeParse({ ...job, sourcePath: "/tmp/model.scad" }).success, false);
  assert.equal(localMcpBrowserRenderJobSchema.safeParse({ ...job, token: "short" }).success, false);
});

test("rejects path-like opaque IDs and unknown tool fields", () => {
  for (const value of ["../project", "/tmp/project", "a/b", "a\\b", ".hidden"]) {
    assert.equal(projectIdSchema.safeParse(value).success, false);
  }
  assert.equal(
    proposeModelSourceInputSchema.safeParse({
      projectId: "project-1",
      parentRevision: null,
      source: "cube(1);",
      requestId: "request-1",
      toolCallId: "tool-1",
      path: "/tmp/model.scad",
    }).success,
    false,
  );
});

test("enforces strict nested artifact metadata", () => {
  const base = {
    artifactId: "artifact-1",
    format: "stl",
    mimeType: "model/stl",
    hash: "a".repeat(64),
    byteSize: 1,
    triangleCount: 1,
    units: "mm",
    axisConvention: "right-handed-z-up",
    boundingBox: { min: [0, 0, 0], max: [1, 1, 1] },
    sourceRevision: "revision-1",
    sourceHash: "b".repeat(64),
    renderer: {
      profile: "production-oci",
      renderer: "fake",
      rendererVersion: "1",
      openscadVersion: "1",
      openscadBinaryHash: `sha256:${"1".repeat(64)}`,
      openscadHelpHash: `sha256:${"2".repeat(64)}`,
      bosl2Version: "1",
      bosl2Digest: `sha256:${"3".repeat(64)}`,
      imageDigest: `sha256:${"4".repeat(64)}`,
      commandPolicyVersion: "1",
      validationPolicyVersion: "cad-validation-v1",
      attestation: {
        engine: "fake",
        mode: "rootless",
        effectiveUid: 1000,
        network: "none",
        readOnlyRoot: true,
        capabilitiesDropped: true,
        noNewPrivileges: true,
        inputReadOnly: true,
        outputIsolated: true,
        resourceLimitsEnforced: true,
        seccompEnforced: true,
        memoryBytes: 536870912,
        nanoCpus: 1000000000,
        pidsLimit: 128,
        openscadVersion: "1",
        openscadBinaryHash: `sha256:${"1".repeat(64)}`,
        openscadHelpHash: `sha256:${"2".repeat(64)}`,
        bosl2Version: "1",
        bosl2Digest: `sha256:${"3".repeat(64)}`,
      },
    },
    tessellation: {},
  };
  assert.equal(artifactManifestSchema.safeParse(base).success, true);
  assert.equal(artifactManifestSchema.safeParse({ ...base, renderer: { ...base.renderer, attestation: { ...base.renderer.attestation, effectiveUid: 0 } } }).success, false);
  assert.equal(artifactManifestSchema.safeParse({ ...base, renderer: { ...base.renderer, attestation: { ...base.renderer.attestation, memoryBytes: base.renderer.attestation.memoryBytes - 1 } } }).success, false);
  assert.equal(artifactManifestSchema.safeParse({ ...base, boundingBox: { ...base.boundingBox, hostPath: "/secret" } }).success, false);
  assert.equal(CAD_LIMITS.sourceBytes, 256 * 1024);
});

test("distinguishes production OCI from non-promotable trusted-local provenance", () => {
  const local = {
    profile: "trusted-local-development", renderer: "trusted-local-openscad-bosl2", rendererVersion: "1",
    openscadVersion: "1", openscadBinaryHash: `sha256:${"1".repeat(64)}`, openscadHelpHash: `sha256:${"2".repeat(64)}`,
    bosl2Version: "1", bosl2Digest: `sha256:${"3".repeat(64)}`, imageDigest: `sha256:${"0".repeat(64)}`,
    commandPolicyVersion: "1", validationPolicyVersion: "cad-validation-v1",
    attestation: { engine: "trusted-local-openscad", mode: "trusted-local", effectiveUid: 501, network: "host", readOnlyRoot: false, capabilitiesDropped: false, noNewPrivileges: false, inputReadOnly: false, outputIsolated: false, resourceLimitsEnforced: false, seccompEnforced: false, memoryBytes: 0, nanoCpus: 0, pidsLimit: 0 },
  };
  const parsed = rendererProvenanceSchema.parse(local);
  assert.equal(isProductionRendererProvenance(parsed), false);
  assert.equal(rendererProvenanceSchema.safeParse({ ...local, profile: "production-oci" }).success, false);
});
