import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { VALIDATION_POLICY_VERSION } from "../../dist/index.js";
export const provenance = {
  profile: "production-oci",
  renderer: "fake-isolated-renderer",
  rendererVersion: "1.0.0",
  openscadVersion: "2025.01",
  openscadBinaryHash: `sha256:${"1".repeat(64)}`,
  openscadHelpHash: `sha256:${"2".repeat(64)}`,
  bosl2Version: "test-pin",
  bosl2Digest: `sha256:${"3".repeat(64)}`,
  imageDigest: `sha256:${"4".repeat(64)}`,
  commandPolicyVersion: "render-command-v1",
  validationPolicyVersion: VALIDATION_POLICY_VERSION,
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
    openscadVersion: "2025.01",
    openscadBinaryHash: `sha256:${"1".repeat(64)}`,
    openscadHelpHash: `sha256:${"2".repeat(64)}`,
    bosl2Version: "test-pin",
    bosl2Digest: `sha256:${"3".repeat(64)}`,
  },
};
export const acceptRendererProvenance = () => true;
export const renderer = {
  async validateAndRender(request) {
    return {
      outcome: "VALID",
      diagnostics: [],
      provenance,
      validationPolicyVersion: VALIDATION_POLICY_VERSION,
      artifacts: [
        {
          format: "stl",
          mimeType: "model/stl",
          bytes: new TextEncoder().encode(`stl:${request.sourceHash}`),
          triangleCount: 12,
          boundingBox: { min: [0, 0, 0], max: [10, 10, 10] },
          tessellation: { profile: "standard" },
        },
        {
          format: "3mf",
          mimeType: "model/3mf",
          bytes: new TextEncoder().encode(`3mf:${request.sourceHash}`),
          triangleCount: 12,
          boundingBox: { min: [0, 0, 0], max: [10, 10, 10] },
          tessellation: { profile: "standard" },
        },
      ],
    };
  },
};
export async function withWorkspace(run) {
  const workspaceRoot = await mkdtemp(
    join(tmpdir(), "theoryfoundry-model-project-"),
  );
  try {
    await run(workspaceRoot);
  } finally {
    await rm(workspaceRoot, { recursive: true, force: true });
  }
}
export async function validCandidate(
  repository,
  projectId,
  parentRevision,
  source,
) {
  const candidate = await repository.proposeModelSource({
    projectId,
    parentRevision,
    source,
    requestId: `request-${Math.random().toString(16).slice(2)}`,
    toolCallId: `tool-${Math.random().toString(16).slice(2)}`,
  });
  const valid = await repository.validateAndRender({
    projectId,
    candidateId: candidate.candidateId,
    previewProfile: "standard",
  });
  assert.equal(valid.state, "VALID");
  return valid;
}
export function promoteInChild(workspaceRoot, candidateId) {
  const moduleUrl = new URL("../../dist/index.js", import.meta.url).href;
  const program = `
    import { ModelProjectRepository } from ${JSON.stringify(moduleUrl)};
    const repository = new ModelProjectRepository({ workspaceRoot: process.argv[1], renderer: { validateAndRender() { throw new Error('unused'); } }, acceptRendererProvenance: () => true });
    process.on('message', async () => {
      try { const value = await repository.promoteCandidate({ projectId: 'demo', candidateId: process.argv[2], expectedParentRevision: null }); process.send({ ok: true, revisionId: value.revisionId }, () => process.exit(0)); }
      catch (error) { process.send({ ok: false, code: error.code ?? 'UNKNOWN' }, () => process.exit(0)); }
    });
  `;
  const child = spawn(
    process.execPath,
    ["--input-type=module", "-e", program, workspaceRoot, candidateId],
    { stdio: ["ignore", "ignore", "pipe", "ipc"] },
  );
  return child;
}
export function promotePausedInChild(workspaceRoot, candidateId) {
  const moduleUrl = new URL("../../dist/index.js", import.meta.url).href;
  const program = `
    import { ModelProjectRepository } from ${JSON.stringify(moduleUrl)};
    const repository = new ModelProjectRepository({
      workspaceRoot: process.argv[1],
      renderer: { validateAndRender() { throw new Error('unused'); } },
      acceptRendererProvenance: () => true,
      failpoint: async (step) => {
        if (step === 'immutable-artifacts-durable') {
          process.send({ stage: 'locked' });
          await new Promise((resolve) => process.once('message', resolve));
        }
      },
    });
    try { const value = await repository.promoteCandidate({ projectId: 'demo', candidateId: process.argv[2], expectedParentRevision: null }); process.send({ ok: true, revisionId: value.revisionId }, () => process.exit(0)); }
    catch (error) { process.send({ ok: false, code: error.code ?? 'UNKNOWN' }, () => process.exit(0)); }
  `;
  return spawn(
    process.execPath,
    ["--input-type=module", "-e", program, workspaceRoot, candidateId],
    { stdio: ["ignore", "ignore", "pipe", "ipc"] },
  );
}
export function promoteCrashInChild(workspaceRoot, candidateId, crashStep) {
  const moduleUrl = new URL("../../dist/index.js", import.meta.url).href;
  const program = `
    import { ModelProjectRepository } from ${JSON.stringify(moduleUrl)};
    const repository = new ModelProjectRepository({
      workspaceRoot: process.argv[1],
      renderer: { validateAndRender() { throw new Error('unused'); } },
      acceptRendererProvenance: () => true,
      failpoint: (step) => { if (step === process.argv[3]) process.exit(86); },
    });
    await repository.promoteCandidate({ projectId: 'demo', candidateId: process.argv[2], expectedParentRevision: null });
    process.exit(0);
  `;
  return spawn(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      program,
      workspaceRoot,
      candidateId,
      crashStep,
    ],
    { stdio: ["ignore", "ignore", "pipe"] },
  );
}
