import assert from "node:assert/strict";
import test from "node:test";
import {
  ModelProjectRepository,
  PostgresModelProjectRepository,
} from "../dist/index.js";
import { renderer, withWorkspace } from "./fixtures/fileProject.fixture.mjs";
import { accept, memoryPool } from "./fixtures/parameterSnapshots.fixture.mjs";

function snapshot() {
  return {
    version: 2,
    files: [
      { id: "base-file", name: "Base.scad", body: "cube([20,10,5]);" },
      {
        id: "tool-file",
        name: "Tool.scad",
        body: "translate([5,2,-1]) cube([5,6,7]);",
      },
    ],
    objects: [
      { id: "base", name: "Body", fileId: "base-file" },
      { id: "tool", name: "Cutout", fileId: "tool-file" },
    ],
    composition: { operation: "difference", objectIds: ["base", "tool"] },
    presentation: {
      fileOrder: ["tool-file", "base-file"],
      objectOrder: ["tool", "base"],
      hiddenFileIds: ["tool-file"],
      hiddenObjectIds: ["tool"],
    },
  };
}

for (const adapter of ["filesystem", "postgres"])
  test(`${adapter}: restore preserves complete v2 identity, visibility, order and accepted source`, async () => {
    await withWorkspace(async (workspaceRoot) => {
      const pool = adapter === "postgres" ? await memoryPool() : undefined;
      if (pool)
        await pool.query(
          `INSERT INTO "user" (id,name,email) VALUES ('owner','Owner','owner@example.test')`,
        );
      const make = () =>
        pool
          ? new PostgresModelProjectRepository({
              pool,
              ownerId: "owner",
              renderer,
              acceptRendererProvenance: () => true,
            })
          : new ModelProjectRepository({
              workspaceRoot,
              renderer,
              acceptRendererProvenance: () => true,
            });
      try {
        const repository = make();
        const { projectId } = await repository.createProject({
          name: "Layer restore",
          description: "Immutable presentation",
        });
        const proposal = {
          projectId,
          parentRevision: null,
          modelFiles: snapshot(),
          requestId: "first",
          toolCallId: "first",
        };
        const first = await accept(
          repository,
          await repository.proposeModelSource(proposal),
        );
        const original = await repository.readModelSource(projectId);
        const changed = snapshot();
        changed.files[0] = {
          ...changed.files[0],
          name: "Larger base",
          body: "cube([30,10,5]);",
        };
        changed.objects[1].name = "Visible cut";
        changed.presentation.fileOrder.reverse();
        changed.presentation.objectOrder.reverse();
        changed.presentation.hiddenFileIds = [];
        changed.presentation.hiddenObjectIds = [];
        const second = await accept(
          repository,
          await repository.proposeModelSource({
            ...proposal,
            parentRevision: first.revisionId,
            modelFiles: changed,
            requestId: "change",
          }),
        );
        assert.notEqual(second.sourceHash, first.sourceHash);
        assert.deepEqual(
          (await make().readModelSource(projectId, first.revisionId))
            .modelFiles,
          snapshot(),
        );
        const restored = await make().restoreRevision({
          projectId,
          revision: first.revisionId,
          requestId: "restore",
          toolCallId: "restore",
        });
        const read = await make().readModelSource(projectId);
        assert.deepEqual(read.modelFiles, snapshot());
        assert.equal(read.source, original.source);
        assert.equal(read.sourceHash, original.sourceHash);
        assert.equal(restored.restoredFrom, first.revisionId);
        assert.equal(restored.parentRevision, second.revisionId);
        assert.deepEqual(
          restored.artifacts.map(({ hash }) => hash),
          first.artifacts.map(({ hash }) => hash),
        );
        for (const artifact of restored.artifacts) {
          assert.equal(artifact.sourceRevision, restored.revisionId);
          assert.equal(artifact.sourceHash, original.sourceHash);
          if (!pool) {
            const downloaded = await make().readArtifact(
              projectId,
              restored.revisionId,
              artifact.artifactId,
            );
            assert.equal(
              new TextDecoder().decode(downloaded.bytes),
              `${artifact.format}:${original.sourceHash}`,
            );
          }
        }
        for (const hidden of [
          { hiddenFileIds: ["base-file"] },
          { hiddenObjectIds: ["base"] },
          { hiddenObjectIds: ["base", "tool"] },
        ]) {
          const invalid = snapshot();
          Object.assign(invalid.presentation, hidden);
          await assert.rejects(
            repository.proposeModelSource({
              ...proposal,
              parentRevision: restored.revisionId,
              modelFiles: invalid,
              requestId: "invalid",
            }),
            (error) => {
              assert.equal(error.code, "INVALID_MODEL_FILES");
              assert.ok(error.message.includes("visible"));
              return true;
            },
          );
          assert.deepEqual(await make().readModelSource(projectId), read);
          assert.equal(
            (await make().getProjectState(projectId)).currentRevision,
            restored.revisionId,
          );
        }
      } finally {
        await pool?.end();
      }
    });
  });
