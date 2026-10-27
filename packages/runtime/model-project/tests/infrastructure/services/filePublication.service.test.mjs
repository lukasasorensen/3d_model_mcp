import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { CadDomainError, ModelProjectRepository } from "../../../dist/index.js";
import {
  acceptRendererProvenance,
  promoteInChild,
  renderer,
  validCandidate,
  withWorkspace,
} from "../../fixtures/fileProject.fixture.mjs";
test("promotion rechecks artifact bytes, limits, policy, and approved provenance inside the lock", async () => {
  await withWorkspace(async (workspaceRoot) => {
    const repository = new ModelProjectRepository({
      workspaceRoot,
      renderer,
      acceptRendererProvenance,
    });
    const candidate = await validCandidate(
      repository,
      "demo",
      null,
      "cube(1);",
    );
    await writeFile(
      join(
        workspaceRoot,
        "demo",
        ".theoryfoundry",
        "candidates",
        candidate.candidateId,
        "artifacts",
        "preview.stl",
      ),
      "substituted",
    );
    await assert.rejects(
      repository.promoteCandidate({
        projectId: "demo",
        candidateId: candidate.candidateId,
        expectedParentRevision: null,
      }),
      (error) =>
        error instanceof CadDomainError &&
        error.code === "ARTIFACT_HASH_MISMATCH",
    );
    assert.equal(
      (await repository.getProjectState("demo")).currentRevision,
      null,
    );

    const approvedOnly = new ModelProjectRepository({
      workspaceRoot,
      renderer,
      acceptRendererProvenance: () => false,
    });
    await assert.rejects(
      approvedOnly.promoteCandidate({
        projectId: "demo",
        candidateId: candidate.candidateId,
        expectedParentRevision: null,
      }),
      (error) =>
        error instanceof CadDomainError && error.code === "PROVENANCE_MISMATCH",
    );
  });
});
test("export metadata is available only for the authoritative current revision", async () => {
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
    await assert.rejects(
      repository.getExportMetadata("demo", first.revisionId, "3mf"),
      (error) =>
        error instanceof CadDomainError && error.code === "STALE_REVISION",
    );
    const first3mf = first.artifacts.find(
      (artifact) => artifact.format === "3mf",
    );
    const firstStl = first.artifacts.find(
      (artifact) => artifact.format === "stl",
    );
    const second3mf = second.artifacts.find(
      (artifact) => artifact.format === "3mf",
    );
    assert.ok(first3mf && firstStl && second3mf);
    await assert.rejects(
      repository.readArtifact("demo", first.revisionId, first3mf.artifactId),
      (error) =>
        error instanceof CadDomainError && error.code === "STALE_REVISION",
    );
    assert.equal(
      (
        await repository.readArtifact(
          "demo",
          first.revisionId,
          firstStl.artifactId,
        )
      ).manifest.format,
      "stl",
    );
    assert.equal(
      (
        await repository.readArtifact(
          "demo",
          second.revisionId,
          second3mf.artifactId,
        )
      ).manifest.sourceRevision,
      second.revisionId,
    );
    assert.equal(
      (await repository.getExportMetadata("demo", second.revisionId, "3mf"))
        .revision,
      second.revisionId,
    );
  });
});
test("cross-process same-parent promotion has exactly one CAS winner", async () => {
  await withWorkspace(async (workspaceRoot) => {
    const repository = new ModelProjectRepository({
      workspaceRoot,
      renderer,
      acceptRendererProvenance,
    });
    const left = await validCandidate(repository, "demo", null, "cube(1);");
    const right = await validCandidate(repository, "demo", null, "sphere(1);");
    const children = [
      promoteInChild(workspaceRoot, left.candidateId),
      promoteInChild(workspaceRoot, right.candidateId),
    ];
    const outcomes = children.map(
      (child) =>
        new Promise((resolve, reject) => {
          child.once("message", resolve);
          child.once("error", reject);
        }),
    );
    children.forEach((child) => child.send("go"));
    const results = await Promise.all(outcomes);
    assert.equal(results.filter((result) => result.ok).length, 1);
    assert.deepEqual(
      results.filter((result) => !result.ok).map((result) => result.code),
      ["STALE_REVISION"],
    );
    const history = await repository.listRevisions("demo");
    assert.equal(history.length, 1);
  });
});
