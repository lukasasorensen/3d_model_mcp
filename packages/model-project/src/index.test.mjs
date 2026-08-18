import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { getEventListeners, once } from "node:events";
import test from "node:test";
import {
  CadDomainError,
  ModelProjectRepository,
  VALIDATION_POLICY_VERSION,
} from "../dist/index.js";

const provenance = {
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

const acceptRendererProvenance = () => true;

const renderer = {
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

async function withWorkspace(run) {
  const workspaceRoot = await mkdtemp(join(tmpdir(), "rjls-model-project-"));
  try {
    await run(workspaceRoot);
  } finally {
    await rm(workspaceRoot, { recursive: true, force: true });
  }
}

async function validCandidate(repository, projectId, parentRevision, source) {
  const candidate = await repository.proposeModelSource({
    projectId,
    parentRevision,
    source,
    requestId: `request-${Math.random().toString(16).slice(2)}`,
    toolCallId: `tool-${Math.random().toString(16).slice(2)}`,
  });
  const valid = await repository.validateAndRender({ projectId, candidateId: candidate.candidateId, previewProfile: "standard" });
  assert.equal(valid.state, "VALID");
  return valid;
}

test("enforces explicit genesis, exact candidate transitions, and immutable promotion", async () => {
  await withWorkspace(async (workspaceRoot) => {
    const repository = new ModelProjectRepository({ workspaceRoot, renderer, acceptRendererProvenance });
    await assert.rejects(
      repository.proposeModelSource({ projectId: "demo", parentRevision: "missing", source: "cube(1);", requestId: "request-1", toolCallId: "tool-1" }),
      (error) => error instanceof CadDomainError && error.code === "STALE_REVISION",
    );
    const candidate = await validCandidate(repository, "demo", null, "cube([10,10,10]);");
    const revision = await repository.promoteCandidate({ projectId: "demo", candidateId: candidate.candidateId, expectedParentRevision: null });
    assert.equal(revision.parentRevision, null);
    assert.equal(revision.artifacts.length, 2);
    await assert.rejects(
      repository.promoteCandidate({ projectId: "demo", candidateId: candidate.candidateId, expectedParentRevision: null }),
      (error) => error instanceof CadDomainError && error.code === "INVALID_CANDIDATE_STATE",
    );
    assert.equal((await repository.readModelSource("demo")).source, "cube([10,10,10]);");
    assert.equal((await repository.getExportMetadata("demo", revision.revisionId, "3mf")).revision, revision.revisionId);
  });
});

test("checks UTF-8 bytes and rejects escaping source references before persistence", async () => {
  await withWorkspace(async (workspaceRoot) => {
    const repository = new ModelProjectRepository({ workspaceRoot, renderer, acceptRendererProvenance });
    await assert.rejects(
      repository.proposeModelSource({ projectId: "demo", parentRevision: null, source: `//${"🙂".repeat(70_000)}`, requestId: "request-1", toolCallId: "tool-1" }),
      (error) => error instanceof CadDomainError && error.code === "SOURCE_TOO_LARGE",
    );
    for (const source of [
      "include <../secret.scad>",
      "include </etc/secret.scad>",
      'import("/etc/passwd")',
      'import(file="/etc/passwd")',
      'import(file="../secret.stl")',
      'surface("/etc/passwd")',
      'surface(file="../heightmap.dat")',
    ]) {
      await assert.rejects(
        repository.proposeModelSource({ projectId: "demo", parentRevision: null, source, requestId: "request-1", toolCallId: "tool-1" }),
        (error) => error instanceof CadDomainError && error.code === "FORBIDDEN_SOURCE_REFERENCE",
      );
    }
    const allowed = await repository.proposeModelSource({ projectId: "demo", parentRevision: null, source: "include <BOSL2/std.scad>\ncube(1);", requestId: "request-ok", toolCallId: "tool-ok" });
    assert.equal(allowed.state, "CREATED");
  });
});

test("source tampering after proposal becomes terminal REJECTED and survives reopen", async () => {
  await withWorkspace(async (workspaceRoot) => {
    let rendererCalls = 0;
    const countingRenderer = { async validateAndRender(request) { rendererCalls += 1; return renderer.validateAndRender(request); } };
    const repository = new ModelProjectRepository({ workspaceRoot, renderer: countingRenderer, acceptRendererProvenance });
    const candidate = await repository.proposeModelSource({ projectId: "demo", parentRevision: null, source: "cube(1);", requestId: "request-tamper", toolCallId: "tool-tamper" });
    const candidateRoot = join(workspaceRoot, "demo", ".rjls", "candidates", candidate.candidateId);
    await writeFile(join(candidateRoot, "model.scad"), "sphere(9);");
    const rejected = await repository.validateAndRender({ projectId: "demo", candidateId: candidate.candidateId, previewProfile: "standard" });
    assert.equal(rejected.state, "REJECTED");
    assert.equal(rejected.diagnostics[0].code, "SOURCE_HASH_MISMATCH");
    assert.equal(rendererCalls, 0);
    const reopened = new ModelProjectRepository({ workspaceRoot, renderer: countingRenderer, acceptRendererProvenance });
    await assert.rejects(
      reopened.validateAndRender({ projectId: "demo", candidateId: candidate.candidateId, previewProfile: "standard" }),
      (error) => error instanceof CadDomainError && error.code === "INVALID_CANDIDATE_STATE",
    );
    assert.equal(JSON.parse(await readFile(join(candidateRoot, "candidate.json"), "utf8")).state, "REJECTED");
  });
});

test("malformed renderer outcomes and nested metadata are rejected at the trust boundary", async () => {
  for (const mutate of [
    (value) => ({ ...value, outcome: "NOT_VALID" }),
    (value) => ({ ...value, unexpected: true }),
    (value) => ({ ...value, artifacts: [{ ...value.artifacts[0], hostPath: "/tmp/leak" }] }),
    (value) => ({ ...value, provenance: { ...value.provenance, attestation: { ...value.provenance.attestation, unexpected: true } } }),
  ]) {
    await withWorkspace(async (workspaceRoot) => {
      const malformedRenderer = { async validateAndRender(request) { return mutate(await renderer.validateAndRender(request)); } };
      const repository = new ModelProjectRepository({ workspaceRoot, renderer: malformedRenderer, acceptRendererProvenance });
      const candidate = await repository.proposeModelSource({ projectId: "demo", parentRevision: null, source: "cube(1);", requestId: "request-malformed", toolCallId: "tool-malformed" });
      const rejected = await repository.validateAndRender({ projectId: "demo", candidateId: candidate.candidateId, previewProfile: "standard" });
      assert.equal(rejected.state, "REJECTED");
      assert.equal((await repository.getProjectState("demo")).currentRevision, null);
      await assert.rejects(
        repository.promoteCandidate({ projectId: "demo", candidateId: candidate.candidateId, expectedParentRevision: null }),
        (error) => error instanceof CadDomainError && error.code === "INVALID_CANDIDATE_STATE",
      );
    });
  }
});

test("production UID zero provenance cannot become VALID or promote even when caller approval returns true", async () => {
  await withWorkspace(async (workspaceRoot) => {
    const rootRenderer = {
      async validateAndRender(request) {
        const result = await renderer.validateAndRender(request);
        return { ...result, provenance: { ...result.provenance, attestation: { ...result.provenance.attestation, effectiveUid: 0 } } };
      },
    };
    const repository = new ModelProjectRepository({ workspaceRoot, renderer: rootRenderer, acceptRendererProvenance: () => true });
    const candidate = await repository.proposeModelSource({ projectId: "demo", parentRevision: null, source: "cube(1);", requestId: "request-root", toolCallId: "tool-root" });
    const rejected = await repository.validateAndRender({ projectId: "demo", candidateId: candidate.candidateId, previewProfile: "standard" });
    assert.equal(rejected.state, "REJECTED");
    assert.equal(rejected.diagnostics[0].code, "RENDER_FAILED");
    await assert.rejects(
      repository.promoteCandidate({ projectId: "demo", candidateId: candidate.candidateId, expectedParentRevision: null }),
      (error) => error instanceof CadDomainError && error.code === "INVALID_CANDIDATE_STATE",
    );
    assert.equal((await repository.getProjectState("demo")).currentRevision, null);
  });
});

test("concurrent validation serializes CREATED to one terminal transition without renderer replay", async () => {
  await withWorkspace(async (workspaceRoot) => {
    let calls = 0;
    let releaseRender;
    let announceStarted;
    const renderGate = new Promise((resolve) => { releaseRender = resolve; });
    const renderStarted = new Promise((resolve) => { announceStarted = resolve; });
    const blockingRenderer = {
      async validateAndRender(request) {
        calls += 1;
        announceStarted();
        await renderGate;
        return renderer.validateAndRender(request);
      },
    };
    const repository = new ModelProjectRepository({ workspaceRoot, renderer: blockingRenderer, acceptRendererProvenance });
    const candidate = await repository.proposeModelSource({
      projectId: "demo",
      parentRevision: null,
      source: "cube(1);",
      requestId: "request-concurrent",
      toolCallId: "tool-concurrent",
    });
    const first = repository.validateAndRender({ projectId: "demo", candidateId: candidate.candidateId, previewProfile: "standard" });
    await renderStarted;
    const second = repository.validateAndRender({ projectId: "demo", candidateId: candidate.candidateId, previewProfile: "standard" });
    releaseRender();
    const outcomes = await Promise.allSettled([first, second]);
    assert.equal(calls, 1);
    assert.equal(outcomes.filter((outcome) => outcome.status === "fulfilled" && outcome.value.state === "VALID").length, 1);
    const conflict = outcomes.find((outcome) => outcome.status === "rejected");
    assert.ok(conflict);
    assert.equal(conflict.reason.code, "INVALID_CANDIDATE_STATE");
    const persisted = JSON.parse(await readFile(join(workspaceRoot, "demo", ".rjls", "candidates", candidate.candidateId, "candidate.json"), "utf8"));
    assert.equal(persisted.state, "VALID");
  });
});

test("promotion rechecks artifact bytes, limits, policy, and approved provenance inside the lock", async () => {
  await withWorkspace(async (workspaceRoot) => {
    const repository = new ModelProjectRepository({ workspaceRoot, renderer, acceptRendererProvenance });
    const candidate = await validCandidate(repository, "demo", null, "cube(1);");
    await writeFile(join(workspaceRoot, "demo", ".rjls", "candidates", candidate.candidateId, "artifacts", "preview.stl"), "substituted");
    await assert.rejects(
      repository.promoteCandidate({ projectId: "demo", candidateId: candidate.candidateId, expectedParentRevision: null }),
      (error) => error instanceof CadDomainError && error.code === "ARTIFACT_HASH_MISMATCH",
    );
    assert.equal((await repository.getProjectState("demo")).currentRevision, null);

    const approvedOnly = new ModelProjectRepository({ workspaceRoot, renderer, acceptRendererProvenance: () => false });
    await assert.rejects(
      approvedOnly.promoteCandidate({ projectId: "demo", candidateId: candidate.candidateId, expectedParentRevision: null }),
      (error) => error instanceof CadDomainError && error.code === "PROVENANCE_MISMATCH",
    );
  });
});

test("trusted-local development provenance can validate but can never be promoted", async () => {
  await withWorkspace(async (workspaceRoot) => {
    const localProvenance = {
      ...provenance,
      profile: "trusted-local-development",
      renderer: "trusted-local-openscad-bosl2",
      attestation: { engine: "trusted-local-openscad", mode: "trusted-local", effectiveUid: 501, network: "host", readOnlyRoot: false, capabilitiesDropped: false, noNewPrivileges: false, inputReadOnly: false, outputIsolated: false, resourceLimitsEnforced: false, seccompEnforced: false, memoryBytes: 0, nanoCpus: 0, pidsLimit: 0 },
    };
    const localRenderer = { async validateAndRender(request) { return { ...(await renderer.validateAndRender(request)), provenance: localProvenance }; } };
    const repository = new ModelProjectRepository({ workspaceRoot, renderer: localRenderer, acceptRendererProvenance: () => true });
    const candidate = await validCandidate(repository, "demo", null, "cube(1);");
    await assert.rejects(
      repository.promoteCandidate({ projectId: "demo", candidateId: candidate.candidateId, expectedParentRevision: null }),
      (error) => error instanceof CadDomainError && error.code === "PROVENANCE_MISMATCH",
    );
    assert.equal((await repository.getProjectState("demo")).currentRevision, null);
  });
});

test("reconciles derived model and restores history as a new current child", async () => {
  await withWorkspace(async (workspaceRoot) => {
    const repository = new ModelProjectRepository({ workspaceRoot, renderer, acceptRendererProvenance });
    const firstCandidate = await validCandidate(repository, "demo", null, "cube(1);");
    const first = await repository.promoteCandidate({ projectId: "demo", candidateId: firstCandidate.candidateId, expectedParentRevision: null });
    const secondCandidate = await validCandidate(repository, "demo", first.revisionId, "cube(2);");
    const second = await repository.promoteCandidate({ projectId: "demo", candidateId: secondCandidate.candidateId, expectedParentRevision: first.revisionId });
    await writeFile(join(workspaceRoot, "demo", "model.scad"), "tampered");
    await repository.getProjectState("demo");
    assert.equal(await readFile(join(workspaceRoot, "demo", "model.scad"), "utf8"), "cube(2);");
    const restored = await repository.restoreRevision({ projectId: "demo", revision: first.revisionId, requestId: "request-restore", toolCallId: "tool-restore" });
    assert.equal(restored.parentRevision, second.revisionId);
    assert.equal(restored.restoredFrom, first.revisionId);
    assert.equal((await repository.readModelSource("demo")).source, "cube(1);");
    assert.deepEqual((await repository.listRevisions("demo")).map((item) => item.revisionId), [restored.revisionId, second.revisionId, first.revisionId]);
  });
});

test("promotion rejects a corrupt pre-existing immutable artifact without advancing CURRENT", async () => {
  await withWorkspace(async (workspaceRoot) => {
    const repository = new ModelProjectRepository({ workspaceRoot, renderer, acceptRendererProvenance });
    const firstCandidate = await validCandidate(repository, "demo", null, "cube(1);");
    const first = await repository.promoteCandidate({ projectId: "demo", candidateId: firstCandidate.candidateId, expectedParentRevision: null });
    const nextCandidate = await validCandidate(repository, "demo", first.revisionId, "cube(2);");
    const stl = nextCandidate.artifacts.find((artifact) => artifact.format === "stl");
    assert.ok(stl);
    const target = join(workspaceRoot, "demo", ".rjls", "artifacts", stl.hash);
    await mkdir(target, { recursive: true });
    await writeFile(join(target, "preview.stl"), "corrupt");
    await assert.rejects(
      repository.promoteCandidate({ projectId: "demo", candidateId: nextCandidate.candidateId, expectedParentRevision: first.revisionId }),
      (error) => error instanceof CadDomainError && error.code === "ARTIFACT_HASH_MISMATCH",
    );
    assert.equal((await repository.getProjectState("demo")).currentRevision, first.revisionId);
  });
});

test("export metadata is available only for the authoritative current revision", async () => {
  await withWorkspace(async (workspaceRoot) => {
    const repository = new ModelProjectRepository({ workspaceRoot, renderer, acceptRendererProvenance });
    const firstCandidate = await validCandidate(repository, "demo", null, "cube(1);");
    const first = await repository.promoteCandidate({ projectId: "demo", candidateId: firstCandidate.candidateId, expectedParentRevision: null });
    const secondCandidate = await validCandidate(repository, "demo", first.revisionId, "cube(2);");
    const second = await repository.promoteCandidate({ projectId: "demo", candidateId: secondCandidate.candidateId, expectedParentRevision: first.revisionId });
    await assert.rejects(
      repository.getExportMetadata("demo", first.revisionId, "3mf"),
      (error) => error instanceof CadDomainError && error.code === "STALE_REVISION",
    );
    const first3mf = first.artifacts.find((artifact) => artifact.format === "3mf");
    const firstStl = first.artifacts.find((artifact) => artifact.format === "stl");
    const second3mf = second.artifacts.find((artifact) => artifact.format === "3mf");
    assert.ok(first3mf && firstStl && second3mf);
    await assert.rejects(
      repository.readArtifact("demo", first.revisionId, first3mf.artifactId),
      (error) => error instanceof CadDomainError && error.code === "STALE_REVISION",
    );
    assert.equal((await repository.readArtifact("demo", first.revisionId, firstStl.artifactId)).manifest.format, "stl");
    assert.equal((await repository.readArtifact("demo", second.revisionId, second3mf.artifactId)).manifest.sourceRevision, second.revisionId);
    assert.equal((await repository.getExportMetadata("demo", second.revisionId, "3mf")).revision, second.revisionId);
  });
});

test("fault injection never exposes an incomplete current revision and reopen recovers derived source", async () => {
  const steps = [
    "immutable-artifact-file-durable",
    "immutable-artifact-directory-durable",
    "immutable-artifacts-parent-durable",
    "immutable-artifacts-durable",
    "revision-source-durable",
    "revision-manifest-file-durable",
    "revision-directory-durable",
    "revision-manifest-durable",
    "revision-renamed",
    "versions-directory-durable",
    "revision-published",
    "current-temp-durable",
    "current-renamed",
    "current-directory-durable",
    "current-advanced",
    "model-temp-durable",
    "model-renamed",
    "model-directory-durable",
    "model-materialized",
  ];
  const currentVisible = new Set([
    "current-renamed",
    "current-directory-durable",
    "current-advanced",
    "model-temp-durable",
    "model-renamed",
    "model-directory-durable",
    "model-materialized",
  ]);
  for (const step of steps) {
    await withWorkspace(async (workspaceRoot) => {
      const repository = new ModelProjectRepository({
        workspaceRoot,
        renderer,
        acceptRendererProvenance,
        failpoint(current) {
          if (current === step) throw new Error(`fail:${step}`);
        },
      });
      const candidate = await validCandidate(repository, "demo", null, "cube(1);");
      await assert.rejects(repository.promoteCandidate({ projectId: "demo", candidateId: candidate.candidateId, expectedParentRevision: null }));
      const reopened = new ModelProjectRepository({ workspaceRoot, renderer, acceptRendererProvenance });
      const state = await reopened.getProjectState("demo");
      if (currentVisible.has(step)) {
        assert.ok(state.currentRevision);
        assert.equal((await reopened.readModelSource("demo")).source, "cube(1);");
        assert.equal(await readFile(join(workspaceRoot, "demo", "model.scad"), "utf8"), "cube(1);");
        const persistedCandidate = JSON.parse(await readFile(join(workspaceRoot, "demo", ".rjls", "candidates", candidate.candidateId, "candidate.json"), "utf8"));
        assert.equal(persistedCandidate.state, "PROMOTED");
      } else {
        assert.equal(state.currentRevision, null);
      }
    });
  }
});

function promoteInChild(workspaceRoot, candidateId) {
  const moduleUrl = new URL("../dist/index.js", import.meta.url).href;
  const program = `
    import { ModelProjectRepository } from ${JSON.stringify(moduleUrl)};
    const repository = new ModelProjectRepository({ workspaceRoot: process.argv[1], renderer: { validateAndRender() { throw new Error('unused'); } }, acceptRendererProvenance: () => true });
    process.on('message', async () => {
      try { const value = await repository.promoteCandidate({ projectId: 'demo', candidateId: process.argv[2], expectedParentRevision: null }); process.send({ ok: true, revisionId: value.revisionId }, () => process.exit(0)); }
      catch (error) { process.send({ ok: false, code: error.code ?? 'UNKNOWN' }, () => process.exit(0)); }
    });
  `;
  const child = spawn(process.execPath, ["--input-type=module", "-e", program, workspaceRoot, candidateId], { stdio: ["ignore", "ignore", "pipe", "ipc"] });
  return child;
}

function promotePausedInChild(workspaceRoot, candidateId) {
  const moduleUrl = new URL("../dist/index.js", import.meta.url).href;
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
  return spawn(process.execPath, ["--input-type=module", "-e", program, workspaceRoot, candidateId], { stdio: ["ignore", "ignore", "pipe", "ipc"] });
}

function promoteCrashInChild(workspaceRoot, candidateId, crashStep) {
  const moduleUrl = new URL("../dist/index.js", import.meta.url).href;
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
  return spawn(process.execPath, ["--input-type=module", "-e", program, workspaceRoot, candidateId, crashStep], { stdio: ["ignore", "ignore", "pipe"] });
}

test("cross-process same-parent promotion has exactly one CAS winner", async () => {
  await withWorkspace(async (workspaceRoot) => {
    const repository = new ModelProjectRepository({ workspaceRoot, renderer, acceptRendererProvenance });
    const left = await validCandidate(repository, "demo", null, "cube(1);");
    const right = await validCandidate(repository, "demo", null, "sphere(1);");
    const children = [promoteInChild(workspaceRoot, left.candidateId), promoteInChild(workspaceRoot, right.candidateId)];
    const outcomes = children.map((child) => new Promise((resolve, reject) => {
      child.once("message", resolve);
      child.once("error", reject);
    }));
    children.forEach((child) => child.send("go"));
    const results = await Promise.all(outcomes);
    assert.equal(results.filter((result) => result.ok).length, 1);
    assert.deepEqual(results.filter((result) => !result.ok).map((result) => result.code), ["STALE_REVISION"]);
    const history = await repository.listRevisions("demo");
    assert.equal(history.length, 1);
  });
});

test("recovers an abandoned cross-process promotion lock", async () => {
  await withWorkspace(async (workspaceRoot) => {
    const repository = new ModelProjectRepository({ workspaceRoot, renderer, acceptRendererProvenance, lockStaleMs: 0 });
    const candidate = await validCandidate(repository, "demo", null, "cube(1);");
    const lock = join(workspaceRoot, "demo", ".rjls", "locks", "promotion.lock");
    await mkdir(lock);
    await writeFile(join(lock, "owner.json"), JSON.stringify({ pid: 999_999_999, token: "00000000-0000-4000-8000-000000000000", acquiredAt: new Date(0).toISOString() }));
    const revision = await repository.promoteCandidate({ projectId: "demo", candidateId: candidate.candidateId, expectedParentRevision: null });
    assert.equal((await repository.getProjectState("demo")).currentRevision, revision.revisionId);
  });
});

test("lock contention polling releases abort listeners after normal delay settlement", async () => {
  await withWorkspace(async (workspaceRoot) => {
    const repository = new ModelProjectRepository({
      workspaceRoot,
      renderer,
      acceptRendererProvenance,
      lockTimeoutMs: 60,
    });
    const candidate = await validCandidate(repository, "demo", null, "cube(1);");
    const lock = join(workspaceRoot, "demo", ".rjls", "locks", "promotion.lock");
    await mkdir(lock);
    await writeFile(join(lock, "owner.json"), "{malformed");
    const controller = new AbortController();
    await assert.rejects(
      repository.promoteCandidate({ projectId: "demo", candidateId: candidate.candidateId, expectedParentRevision: null, signal: controller.signal }),
      (error) => error instanceof CadDomainError && error.code === "LOCK_TIMEOUT",
    );
    assert.equal(getEventListeners(controller.signal, "abort").length, 0);
  });
});

test("malformed owner metadata cannot steal a live cross-process promotion lock", async () => {
  await withWorkspace(async (workspaceRoot) => {
    const repository = new ModelProjectRepository({ workspaceRoot, renderer, acceptRendererProvenance });
    const left = await validCandidate(repository, "demo", null, "cube(1);");
    const right = await validCandidate(repository, "demo", null, "sphere(1);");
    const child = promotePausedInChild(workspaceRoot, left.candidateId);
    const [locked] = await once(child, "message");
    assert.equal(locked.stage, "locked");
    await writeFile(join(workspaceRoot, "demo", ".rjls", "locks", "promotion.lock", "owner.json"), "{malformed");
    const contender = new ModelProjectRepository({ workspaceRoot, renderer, acceptRendererProvenance, lockTimeoutMs: 100, lockStaleMs: 0 });
    await assert.rejects(
      contender.promoteCandidate({ projectId: "demo", candidateId: right.candidateId, expectedParentRevision: null }),
      (error) => error instanceof CadDomainError && error.code === "LOCK_TIMEOUT",
    );
    const resultPromise = once(child, "message");
    child.send("resume");
    const [result] = await resultPromise;
    assert.equal(result.ok, true);
    assert.equal((await repository.listRevisions("demo")).length, 1);
  });
});

test("process death after CURRENT rename reopens authoritatively and reconciles candidate audit state", async () => {
  await withWorkspace(async (workspaceRoot) => {
    const repository = new ModelProjectRepository({ workspaceRoot, renderer, acceptRendererProvenance });
    const candidate = await validCandidate(repository, "demo", null, "cube(1);");
    const child = promoteCrashInChild(workspaceRoot, candidate.candidateId, "current-renamed");
    const [exitCode] = await once(child, "exit");
    assert.equal(exitCode, 86);
    const reopened = new ModelProjectRepository({ workspaceRoot, renderer, acceptRendererProvenance, lockStaleMs: 0 });
    const recovered = await reopened.getProjectState("demo");
    assert.ok(recovered.currentRevision);
    const persisted = JSON.parse(await readFile(join(workspaceRoot, "demo", ".rjls", "candidates", candidate.candidateId, "candidate.json"), "utf8"));
    assert.equal(persisted.state, "PROMOTED");
    const nextCandidate = await validCandidate(reopened, "demo", recovered.currentRevision, "cube(2);");
    const nextRevision = await reopened.promoteCandidate({ projectId: "demo", candidateId: nextCandidate.candidateId, expectedParentRevision: recovered.currentRevision });
    assert.equal(nextRevision.parentRevision, recovered.currentRevision);
  });
});
