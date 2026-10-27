import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { CadDomainError, ModelProjectRepository } from "../dist/index.js";
import {
  acceptRendererProvenance,
  renderer,
  validCandidate,
  withWorkspace,
} from "./fixtures/fileProject.fixture.mjs";
test("enforces explicit genesis, exact candidate transitions, and immutable promotion", async () => {
  await withWorkspace(async (workspaceRoot) => {
    const repository = new ModelProjectRepository({
      workspaceRoot,
      renderer,
      acceptRendererProvenance,
    });
    await assert.rejects(
      repository.proposeModelSource({
        projectId: "demo",
        parentRevision: "missing",
        source: "cube(1);",
        requestId: "request-1",
        toolCallId: "tool-1",
      }),
      (error) =>
        error instanceof CadDomainError && error.code === "STALE_REVISION",
    );
    const candidate = await validCandidate(
      repository,
      "demo",
      null,
      "cube([10,10,10]);",
    );
    const revision = await repository.promoteCandidate({
      projectId: "demo",
      candidateId: candidate.candidateId,
      expectedParentRevision: null,
    });
    assert.equal(revision.parentRevision, null);
    assert.equal(revision.artifacts.length, 2);
    await assert.rejects(
      repository.promoteCandidate({
        projectId: "demo",
        candidateId: candidate.candidateId,
        expectedParentRevision: null,
      }),
      (error) =>
        error instanceof CadDomainError &&
        error.code === "INVALID_CANDIDATE_STATE",
    );
    assert.equal(
      (await repository.readModelSource("demo")).source,
      "cube([10,10,10]);",
    );
    assert.equal(
      (await repository.getExportMetadata("demo", revision.revisionId, "3mf"))
        .revision,
      revision.revisionId,
    );
  });
});
test("lists only valid project directories in stable order", async () => {
  await withWorkspace(async (workspaceRoot) => {
    const repository = new ModelProjectRepository({
      workspaceRoot,
      renderer,
      acceptRendererProvenance,
    });
    await mkdir(join(workspaceRoot, "zeta-project"));
    await mkdir(join(workspaceRoot, "alpha-project"));
    await mkdir(join(workspaceRoot, ".internal"));
    await writeFile(join(workspaceRoot, "file-project"), "not a directory");
    assert.deepEqual(await repository.listProjects(), [
      { projectId: "alpha-project", name: "Untitled project", description: "" },
      { projectId: "zeta-project", name: "Untitled project", description: "" },
    ]);
  });
});
test("promotion rejects a corrupt pre-existing immutable artifact without advancing CURRENT", async () => {
  await withWorkspace(async (workspaceRoot) => {
    const repository = new ModelProjectRepository({
      workspaceRoot,
      renderer,
      acceptRendererProvenance,
    });
    const firstCandidate = await validCandidate(
      repository,
      "demo",
      null,
      "cube(1);",
    );
    const first = await repository.promoteCandidate({
      projectId: "demo",
      candidateId: firstCandidate.candidateId,
      expectedParentRevision: null,
    });
    const nextCandidate = await validCandidate(
      repository,
      "demo",
      first.revisionId,
      "cube(2);",
    );
    const stl = nextCandidate.artifacts.find(
      (artifact) => artifact.format === "stl",
    );
    assert.ok(stl);
    const target = join(
      workspaceRoot,
      "demo",
      ".theoryfoundry",
      "artifacts",
      stl.hash,
    );
    await mkdir(target, { recursive: true });
    await writeFile(join(target, "preview.stl"), "corrupt");
    await assert.rejects(
      repository.promoteCandidate({
        projectId: "demo",
        candidateId: nextCandidate.candidateId,
        expectedParentRevision: first.revisionId,
      }),
      (error) =>
        error instanceof CadDomainError &&
        error.code === "ARTIFACT_HASH_MISMATCH",
    );
    assert.equal(
      (await repository.getProjectState("demo")).currentRevision,
      first.revisionId,
    );
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
      const candidate = await validCandidate(
        repository,
        "demo",
        null,
        "cube(1);",
      );
      await assert.rejects(
        repository.promoteCandidate({
          projectId: "demo",
          candidateId: candidate.candidateId,
          expectedParentRevision: null,
        }),
      );
      const reopened = new ModelProjectRepository({
        workspaceRoot,
        renderer,
        acceptRendererProvenance,
      });
      const state = await reopened.getProjectState("demo");
      if (currentVisible.has(step)) {
        assert.ok(state.currentRevision);
        assert.equal(
          (await reopened.readModelSource("demo")).source,
          "cube(1);",
        );
        assert.equal(
          await readFile(join(workspaceRoot, "demo", "model.scad"), "utf8"),
          "cube(1);",
        );
        const persistedCandidate = JSON.parse(
          await readFile(
            join(
              workspaceRoot,
              "demo",
              ".theoryfoundry",
              "candidates",
              candidate.candidateId,
              "candidate.json",
            ),
            "utf8",
          ),
        );
        assert.equal(persistedCandidate.state, "PROMOTED");
      } else {
        assert.equal(state.currentRevision, null);
      }
    });
  }
});
test("reconciles derived model and restores history as a new current child", async () => {
  await withWorkspace(async (workspaceRoot) => {
    const repository = new ModelProjectRepository({
      workspaceRoot,
      renderer,
      acceptRendererProvenance,
    });
    const firstCandidate = await validCandidate(
      repository,
      "demo",
      null,
      "cube(1);",
    );
    const first = await repository.promoteCandidate({
      projectId: "demo",
      candidateId: firstCandidate.candidateId,
      expectedParentRevision: null,
    });
    const secondCandidate = await validCandidate(
      repository,
      "demo",
      first.revisionId,
      "cube(2);",
    );
    const second = await repository.promoteCandidate({
      projectId: "demo",
      candidateId: secondCandidate.candidateId,
      expectedParentRevision: first.revisionId,
    });
    await writeFile(join(workspaceRoot, "demo", "model.scad"), "tampered");
    await repository.getProjectState("demo");
    assert.equal(
      await readFile(join(workspaceRoot, "demo", "model.scad"), "utf8"),
      "cube(2);",
    );
    const restored = await repository.restoreRevision({
      projectId: "demo",
      revision: first.revisionId,
      requestId: "request-restore",
      toolCallId: "tool-restore",
    });
    assert.equal(restored.parentRevision, second.revisionId);
    assert.equal(restored.restoredFrom, first.revisionId);
    assert.equal((await repository.readModelSource("demo")).source, "cube(1);");
    assert.deepEqual(
      (await repository.listRevisions("demo")).map((item) => item.revisionId),
      [restored.revisionId, second.revisionId, first.revisionId],
    );
  });
});
