import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

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
      artifacts: [
        {
          format: "stl",
          mimeType: "model/stl",
          bytes: new TextEncoder().encode(`stl:${request.sourceHash}`),
          triangleCount: 12,
          boundingBox: { min: [0, 0, 0], max: [10, 10, 10] },
          tessellation: { profile: "standard" },
        },
      ],
    };
  },
};

async function exerciseRepositoryContract(repository) {
  const project = await repository.createProject({
    name: "Bracket",
    description: "Initial design",
  });
  assert.deepEqual(await repository.listProjects(), [project]);
  const updated = await repository.updateProject({
    projectId: project.projectId,
    name: "Updated bracket",
  });
  assert.equal(updated.description, "Initial design");
  assert.equal(updated.name, "Updated bracket");
  await assert.rejects(
    repository.updateProject({ projectId: project.projectId, description: "" }),
  );
  assert.deepEqual(await repository.listProjects(), [updated]);
  await assert.rejects(
    repository.updateProject({ projectId: "missing", name: "New" }),
    { code: "PROJECT_NOT_FOUND" },
  );
  await assert.rejects(
    repository.updateProject({ projectId: project.projectId }),
  );
  const candidate = await repository.proposeModelSource({
    projectId: project.projectId,
    parentRevision: null,
    source: "cube([10,10,10]);",
    requestId: "contract-request-1",
    toolCallId: "contract-tool-1",
  });
  assert.equal(candidate.state, "CREATED");
  await assert.rejects(
    repository.readValidatedCandidateSource(
      project.projectId,
      candidate.candidateId,
    ),
    { code: "INVALID_CANDIDATE_STATE" },
  );
  const validated = await repository.validateAndRender({
    projectId: project.projectId,
    candidateId: candidate.candidateId,
    previewProfile: "standard",
  });
  assert.equal(validated.state, "VALID");
  assert.deepEqual(
    await repository.readValidatedCandidateSource(
      project.projectId,
      candidate.candidateId,
    ),
    {
      candidateId: candidate.candidateId,
      source: "cube([10,10,10]);",
      sourceHash: candidate.sourceHash,
    },
  );
  const firstRevision = await repository.promoteCandidate({
    projectId: project.projectId,
    candidateId: candidate.candidateId,
    expectedParentRevision: null,
  });
  const state = await repository.getProjectState(project.projectId);
  assert.equal(state.currentRevision, firstRevision.revisionId);
  assert.equal(state.source?.hash, firstRevision.sourceHash);
  assert.equal(
    (await repository.readModelSource(project.projectId)).source,
    "cube([10,10,10]);",
  );
  assert.deepEqual(
    (await repository.listRevisions(project.projectId)).map(
      (revision) => revision.revisionId,
    ),
    [firstRevision.revisionId],
  );
  const restored = await repository.restoreRevision({
    projectId: project.projectId,
    revision: firstRevision.revisionId,
    requestId: "contract-request-restore",
    toolCallId: "contract-tool-restore",
  });
  assert.equal(restored.restoredFrom, firstRevision.revisionId);
  assert.equal(
    (
      await repository.getExportMetadata(
        project.projectId,
        restored.revisionId,
        "3mf",
      )
    ).revision,
    restored.revisionId,
  );
  return project.projectId;
}

async function migratedMemoryPool() {
  const database = new PGlite();
  const migrations = new URL("../drizzle/", import.meta.url);
  const journal = JSON.parse(
    await readFile(new URL("meta/_journal.json", migrations), "utf8"),
  );
  for (const { tag } of journal.entries)
    await database.exec(
      await readFile(new URL(tag + ".sql", migrations), "utf8"),
    );
  const query = (sql, params) => database.query(sql, params);
  return {
    query,
    connect: async () => ({ query, release: () => {} }),
    end: () => database.close(),
  };
}

test("filesystem repository satisfies the project-store contract", async () => {
  const workspaceRoot = await mkdtemp(
    join(tmpdir(), "theoryfoundry-filesystem-contract-"),
  );
  try {
    const repository = new ModelProjectRepository({
      workspaceRoot,
      renderer,
      acceptRendererProvenance: () => true,
    });
    await exerciseRepositoryContract(repository);
    const reopened = new ModelProjectRepository({
      workspaceRoot,
      renderer,
      acceptRendererProvenance: () => true,
    });
    assert.equal((await reopened.listProjects())[0].name, "Updated bracket");
    await assert.rejects(
      reopened.createProject({ name: " ", description: "Test model" }),
    );
    await assert.rejects(
      reopened.createProject({ name: "Test project", description: " " }),
    );
    const blank = await reopened.createProject({
      name: "Test project",
      description: "Test model",
    });
    assert.equal(blank.name, "Test project");
    assert.equal(blank.description, "Test model");
    await Promise.all([
      reopened.updateProject({
        projectId: blank.projectId,
        name: "Concurrent name",
      }),
      reopened.updateProject({
        projectId: blank.projectId,
        description: "Concurrent description",
      }),
    ]);
    assert.deepEqual(
      (await reopened.listProjects()).find(
        (project) => project.projectId === blank.projectId,
      ),
      {
        projectId: blank.projectId,
        name: "Concurrent name",
        description: "Concurrent description",
      },
    );
  } finally {
    await rm(workspaceRoot, { recursive: true, force: true });
  }
});

test("PostgreSQL repository satisfies the project-store contract and isolates owners", async () => {
  const pool = await migratedMemoryPool();
  try {
    await pool.query(
      "INSERT INTO \"user\" (id, name, email) VALUES ('owner-a', 'Owner A', 'a@example.com'), ('owner-b', 'Owner B', 'b@example.com')",
    );
    const ownerA = new PostgresModelProjectRepository({
      pool,
      ownerId: "owner-a",
      renderer,
      acceptRendererProvenance: () => true,
    });
    const projectId = await exerciseRepositoryContract(ownerA);
    const ownerB = new PostgresModelProjectRepository({
      pool,
      ownerId: "owner-b",
      renderer,
      acceptRendererProvenance: () => true,
    });
    await assert.rejects(ownerB.updateProject({ projectId, name: "Stolen" }), {
      code: "PROJECT_NOT_FOUND",
    });
    assert.equal((await ownerA.listProjects())[0].name, "Updated bracket");
    await assert.rejects(
      ownerB.getProjectState(projectId),
      (error) => error?.code === "PROJECT_NOT_FOUND",
    );
    await assert.rejects(
      ownerB.readValidatedCandidateSource(projectId, "unknown"),
      { code: "PROJECT_NOT_FOUND" },
    );
    assert.deepEqual(await ownerB.listProjects(), []);
    const hidden = { code: "PROJECT_NOT_FOUND" };
    await assert.rejects(ownerB.setProjectArchived(projectId, true), hidden);
    await assert.rejects(ownerB.deleteProject(projectId), hidden);
    await ownerA.setProjectArchived(projectId, true);
    assert.deepEqual(await ownerA.listProjects(), []);
    assert.equal(
      (await ownerA.listProjects("archived"))[0].projectId,
      projectId,
    );
    assert.deepEqual(await ownerB.listProjects("archived"), []);
    const state = await ownerA.getProjectState(projectId);
    await ownerA.updateProject({ projectId, name: "Archived bracket" });
    const draft = await ownerA.proposeModelSource({
      projectId,
      parentRevision: state.currentRevision,
      source: "cube(12);",
      requestId: "archived-edit",
      toolCallId: "archived-edit",
    });
    await ownerA.setProjectArchived(projectId, false);
    assert.equal((await ownerA.listProjects())[0].name, "Archived bracket");
    await ownerA.deleteProject(projectId);
    await ownerA.deleteProject(projectId);
    await assert.rejects(ownerA.getProjectSnapshot(projectId), hidden);
    await assert.rejects(ownerA.setProjectArchived(projectId, false), hidden);
    await assert.rejects(
      ownerA.readModelSource(projectId, state.currentRevision),
      hidden,
    );
    await assert.rejects(
      ownerA.getCandidate(projectId, draft.candidateId),
      hidden,
    );
    assert.deepEqual(await ownerA.listProjects(), []);
    const extra = await ownerA.createProject({
      name: "Second",
      description: "Archived deletion",
    });
    await ownerA.setProjectArchived(extra.projectId, true);
    await ownerA.deleteProject(extra.projectId);
    assert.deepEqual(await ownerA.listProjects("archived"), []);
    assert.equal(
      (
        await pool.query("SELECT source FROM candidates WHERE id=$1", [
          draft.candidateId,
        ])
      ).rows.length,
      0,
    );
  } finally {
    await pool.end();
  }
});

test("the dashboard partitions one owned project snapshot even if another tab archives during the read", async () => {
  const pool = await migratedMemoryPool();
  try {
    await pool.query(
      `INSERT INTO "user" (id,name,email) VALUES ('a','A','a@example.com'),('b','B','b@example.com')`,
    );
    await pool.query(`INSERT INTO projects (id,owner_id,is_archived,is_deleted) VALUES
      ('moving','a',false,false), ('stored','a',true,false), ('removed','a',true,true), ('foreign','b',false,false)`);
    let reads = 0;
    const repository = new PostgresModelProjectRepository({
      ownerId: "a",
      renderer,
      acceptRendererProvenance: () => true,
      pool: {
        query: async (...args) => {
          const result = await pool.query(...args);
          reads++;
          if (reads === 1)
            await pool.query(
              "UPDATE projects SET is_archived=true WHERE id='moving'",
            );
          return result;
        },
      },
    });
    const snapshot = await repository.listProjectViews();
    assert.equal(reads, 1);
    assert.deepEqual(
      snapshot.active.map((p) => p.projectId),
      ["moving"],
    );
    assert.deepEqual(
      snapshot.archived.map((p) => p.projectId),
      ["stored"],
    );
    const refreshed = await repository.listProjectViews();
    assert.deepEqual(refreshed.active, []);
    assert.deepEqual(
      refreshed.archived.map((p) => p.projectId),
      ["moving", "stored"],
    );
  } finally {
    await pool.end();
  }
});
