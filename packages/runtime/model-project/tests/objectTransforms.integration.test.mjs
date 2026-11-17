import test from "node:test";
import assert from "node:assert/strict";
import {
  applyModelFileOperations,
  copyModelObject,
  pasteModelObject,
  defaultObjectTransform,
} from "@theoryfoundry/contracts";
import {
  ModelProjectRepository,
  PostgresModelProjectRepository,
  CadDomainError,
} from "../dist/index.js";
import { renderer, withWorkspace } from "./fixtures/fileProject.fixture.mjs";
import { memoryPool, accept } from "./fixtures/parameterSnapshots.fixture.mjs";

const snapshot = () => ({
  version: 1,
  files: [{ id: "file", name: "Block", body: "cube([2,3,4]);" }],
  objects: [
    { id: "first", name: "First", fileId: "file" },
    { id: "second", name: "Second", fileId: "file" },
  ],
  composition: { operation: "union", objectIds: ["first", "second"] },
});
const transform = {
  position: [10, 20, 30],
  rotation: [45, 30, 90],
  scale: [2, 3, 4],
};

for (const adapter of ["filesystem", "postgres"])
  test(`${adapter}: transforms and independent paste persist, validate atomically, and undo as new guarded revisions`, async () => {
    await withWorkspace(async (workspaceRoot) => {
      const pool = adapter === "postgres" ? await memoryPool() : undefined;
      let failRender = false;
      const renderInputs = [];
      const controlled = {
        async validateAndRender(input) {
          renderInputs.push(input);
          if (failRender)
            throw new CadDomainError(
              "CANCELLED",
              "Injected render cancellation",
            );
          return renderer.validateAndRender(input);
        },
      };
      if (pool)
        await pool.query(
          `INSERT INTO "user" (id,name,email) VALUES ('owner','Owner','owner@example.test')`,
        );
      const make = () =>
        pool
          ? new PostgresModelProjectRepository({
              pool,
              ownerId: "owner",
              renderer: controlled,
              acceptRendererProvenance: () => true,
            })
          : new ModelProjectRepository({
              workspaceRoot,
              renderer: controlled,
              acceptRendererProvenance: () => true,
            });
      try {
        let repository = make();
        const { projectId } = await repository.createProject({
          name: "Transforms",
          description: "Regression",
        });
        const propose = (modelFiles, parentRevision, requestId) =>
          repository.proposeModelSource({
            projectId,
            modelFiles,
            parentRevision,
            requestId,
            toolCallId: requestId,
          });
        const base = snapshot();
        const first = await accept(
          repository,
          await propose(base, null, "initial"),
        );
        const identity = applyModelFileOperations(base, [
          {
            op: "set_object_transform",
            id: "first",
            transform: defaultObjectTransform(),
          },
        ]);
        assert.equal(
          (await propose(identity, first.revisionId, "identity")).sourceHash,
          first.sourceHash,
        );
        const moved = applyModelFileOperations(base, [
          { op: "set_object_transform", id: "first", transform },
        ]);
        const candidate = await propose(moved, first.revisionId, "move");
        failRender = true;
        await assert.rejects(accept(repository, candidate), {
          code: "CANCELLED",
        });
        assert.equal(
          (await repository.getProjectState(projectId)).currentRevision,
          first.revisionId,
        );
        failRender = false;
        const second = await accept(repository, candidate);
        repository = make();
        const read = await repository.readModelSource(projectId);
        assert.deepEqual(read.modelFiles, moved);
        assert.ok(
          read.source.includes(
            "translate([10,20,30]) rotate([45,30,90]) scale([2,3,4]) union() {\ncube([2,3,4]);\n}",
          ),
        );
        assert.equal(
          read.modelFiles.objects.find((object) => object.id === "second")
            .transform,
          undefined,
        );
        const clipboard = copyModelObject({
          projectId,
          modelFiles: moved,
          objectId: "first",
        });
        const pasted = pasteModelObject({
          projectId,
          modelFiles: moved,
          clipboard,
          objectId: "pasted",
          fileId: "pasted-file",
        });
        const third = await accept(
          repository,
          await propose(pasted, second.revisionId, "paste"),
        );
        assert.equal(
          (await make().readModelSource(projectId)).modelFiles.objects.length,
          3,
        );
        const undo = await accept(
          repository,
          await propose(moved, third.revisionId, "undo-paste"),
        );
        assert.equal(undo.sourceHash, second.sourceHash);
        const redo = await accept(
          repository,
          await propose(pasted, undo.revisionId, "redo-paste"),
        );
        assert.equal(redo.sourceHash, third.sourceHash);
        assert.deepEqual(
          (await make().readModelSource(projectId)).modelFiles,
          pasted,
        );
        await assert.rejects(propose(base, third.revisionId, "stale-undo"), {
          code: "STALE_REVISION",
        });
        assert.equal(
          (await repository.getProjectState(projectId)).currentRevision,
          redo.revisionId,
        );
        assert.ok(
          renderInputs.some((input) => input.sourceHash === third.sourceHash),
        );
      } finally {
        await pool?.end();
      }
    });
  });
