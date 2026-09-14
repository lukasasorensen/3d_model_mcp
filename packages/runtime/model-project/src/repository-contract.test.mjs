import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { DataType, newDb } from "pg-mem";

import {
  ModelProjectRepository,
  PostgresModelProjectRepository,
  VALIDATION_POLICY_VERSION,
} from "../dist/index.js";

const provenance = {
  profile: "production-oci",
  renderer: "contract-renderer",
  rendererVersion: "1.0.0",
  openscadVersion: "2025.01",
  openscadBinaryHash: `sha256:${"1".repeat(64)}`,
  openscadHelpHash: `sha256:${"2".repeat(64)}`,
  bosl2Version: "contract-pin",
  bosl2Digest: `sha256:${"3".repeat(64)}`,
  imageDigest: `sha256:${"4".repeat(64)}`,
  commandPolicyVersion: "render-command-v1",
  validationPolicyVersion: VALIDATION_POLICY_VERSION,
  attestation: {
    engine: "contract",
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
    memoryBytes: 536_870_912,
    nanoCpus: 1_000_000_000,
    pidsLimit: 128,
    openscadVersion: "2025.01",
    openscadBinaryHash: `sha256:${"1".repeat(64)}`,
    openscadHelpHash: `sha256:${"2".repeat(64)}`,
    bosl2Version: "contract-pin",
    bosl2Digest: `sha256:${"3".repeat(64)}`,
  },
};

const renderer = {
  async validateAndRender(request) {
    return {
      outcome: "VALID",
      diagnostics: [],
      provenance,
      validationPolicyVersion: VALIDATION_POLICY_VERSION,
      artifacts: [{
        format: "stl",
        mimeType: "model/stl",
        bytes: new TextEncoder().encode(`stl:${request.sourceHash}`),
        triangleCount: 12,
        boundingBox: { min: [0, 0, 0], max: [10, 10, 10] },
        tessellation: { profile: "standard" },
      }],
    };
  },
};

async function exerciseRepositoryContract(repository) {
  const project = await repository.createProject({ name: "Bracket", description: "Initial design" });
  assert.deepEqual(await repository.listProjects(), [project]);
  const updated = await repository.updateProject({ projectId: project.projectId, name: "Updated bracket" });
  assert.equal(updated.description, "Initial design");
  assert.equal(updated.name, "Updated bracket");
  const cleared = await repository.updateProject({ projectId: project.projectId, description: "" });
  assert.equal(cleared.name, "Updated bracket");
  assert.deepEqual(await repository.listProjects(), [cleared]);
  await assert.rejects(repository.updateProject({ projectId: "missing", name: "New" }), { code: "PROJECT_NOT_FOUND" });
  await assert.rejects(repository.updateProject({ projectId: project.projectId }));
  const candidate = await repository.proposeModelSource({
    projectId: project.projectId,
    parentRevision: null,
    source: "cube([10,10,10]);",
    requestId: "contract-request-1",
    toolCallId: "contract-tool-1",
  });
  assert.equal(candidate.state, "CREATED");
  await assert.rejects(repository.readValidatedCandidateSource(project.projectId, candidate.candidateId), { code: "INVALID_CANDIDATE_STATE" });
  const validated = await repository.validateAndRender({ projectId: project.projectId, candidateId: candidate.candidateId, previewProfile: "standard" });
  assert.equal(validated.state, "VALID");
  assert.deepEqual(await repository.readValidatedCandidateSource(project.projectId, candidate.candidateId), { candidateId: candidate.candidateId, source: "cube([10,10,10]);", sourceHash: candidate.sourceHash });
  const firstRevision = await repository.promoteCandidate({ projectId: project.projectId, candidateId: candidate.candidateId, expectedParentRevision: null });
  const state = await repository.getProjectState(project.projectId);
  assert.equal(state.currentRevision, firstRevision.revisionId);
  assert.equal(state.source?.hash, firstRevision.sourceHash);
  assert.equal((await repository.readModelSource(project.projectId)).source, "cube([10,10,10]);");
  assert.deepEqual((await repository.listRevisions(project.projectId)).map((revision) => revision.revisionId), [firstRevision.revisionId]);
  const restored = await repository.restoreRevision({
    projectId: project.projectId,
    revision: firstRevision.revisionId,
    requestId: "contract-request-restore",
    toolCallId: "contract-tool-restore",
  });
  assert.equal(restored.restoredFrom, firstRevision.revisionId);
  assert.equal((await repository.getExportMetadata(project.projectId, restored.revisionId, "3mf")).revision, restored.revisionId);
  return project.projectId;
}

async function migratedMemoryPool() {
  const database = newDb({ autoCreateForeignKeyIndices: true });
  database.public.registerOperator({
    operator: "~",
    left: DataType.text,
    right: DataType.text,
    returns: DataType.bool,
    implementation: (value, pattern) => new RegExp(pattern).test(value),
  });
  const adapter = database.adapters.createPg();
  const pool = new adapter.Pool();
  for (const migration of ["0000_tough_jetstream.sql", "0001_material_ben_grimm.sql", "0002_marvelous_puff_adder.sql", "0008_sad_starhawk.sql"]) {
    const sql = await readFile(new URL(`../drizzle/${migration}`, import.meta.url), "utf8");
    for (const statement of sql.split("--> statement-breakpoint").map((part) => part.trim()).filter(Boolean)) await pool.query(statement);
  }
  return pool;
}

test("filesystem repository satisfies the project-store contract", async () => {
  const workspaceRoot = await mkdtemp(join(tmpdir(), "rjls-filesystem-contract-"));
  try {
    const repository = new ModelProjectRepository({ workspaceRoot, renderer, acceptRendererProvenance: () => true });
    await exerciseRepositoryContract(repository);
    const reopened = new ModelProjectRepository({ workspaceRoot, renderer, acceptRendererProvenance: () => true });
    assert.equal((await reopened.listProjects())[0].name, "Updated bracket");
    const blank = await reopened.createProject();
    assert.equal(blank.name, "Untitled project");
    assert.equal(blank.description, "");
    await Promise.all([
      reopened.updateProject({ projectId: blank.projectId, name: "Concurrent name" }),
      reopened.updateProject({ projectId: blank.projectId, description: "Concurrent description" }),
    ]);
    assert.deepEqual((await reopened.listProjects()).find((project) => project.projectId === blank.projectId), {
      projectId: blank.projectId, name: "Concurrent name", description: "Concurrent description",
    });
  } finally {
    await rm(workspaceRoot, { recursive: true, force: true });
  }
});

test("PostgreSQL repository satisfies the project-store contract and isolates owners", async () => {
  const pool = await migratedMemoryPool();
  try {
    await pool.query("INSERT INTO \"user\" (id, name, email) VALUES ('owner-a', 'Owner A', 'a@example.com'), ('owner-b', 'Owner B', 'b@example.com')");
    const ownerA = new PostgresModelProjectRepository({ pool, ownerId: "owner-a", renderer, acceptRendererProvenance: () => true });
    const projectId = await exerciseRepositoryContract(ownerA);
    const ownerB = new PostgresModelProjectRepository({ pool, ownerId: "owner-b", renderer, acceptRendererProvenance: () => true });
    await assert.rejects(ownerB.updateProject({ projectId, name: "Stolen" }), { code: "PROJECT_NOT_FOUND" });
    assert.equal((await ownerA.listProjects())[0].name, "Updated bracket");
    await assert.rejects(ownerB.getProjectState(projectId), (error) => error?.code === "PROJECT_NOT_FOUND");
    await assert.rejects(ownerB.readValidatedCandidateSource(projectId, "unknown"), { code: "PROJECT_NOT_FOUND" });
    assert.deepEqual(await ownerB.listProjects(), []);
  } finally {
    await pool.end();
  }
});
