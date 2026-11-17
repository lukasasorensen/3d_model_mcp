import test from "node:test";
import assert from "node:assert/strict";
import {
  ModelProjectRepository,
  PostgresModelProjectRepository,
} from "@theoryfoundry/model-project";
import {
  createCadMcpServer,
  createCadToolRegistry,
  invokeCadTool,
} from "@theoryfoundry/mcp";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import {
  renderer,
  withWorkspace,
} from "../../../model-project/tests/fixtures/fileProject.fixture.mjs";
import {
  memoryPool,
  accept,
  width,
} from "../../../model-project/tests/fixtures/parameterSnapshots.fixture.mjs";
const snapshot = {
  version: 1,
  files: [
    { id: "a", name: "A", body: "cube([width,10,5]);" },
    { id: "b", name: "B", body: "cube(1);" },
  ],
  objects: [
    { id: "a", name: "A", fileId: "a" },
    { id: "b", name: "B", fileId: "b" },
  ],
  composition: { operation: "difference", objectIds: ["a", "b"] },
};
for (const adapter of ["filesystem", "postgres"])
  test(`${adapter}: project-scoped file/object tools serialize, retry, persist and enforce atomic visibility changes`, async () => {
    await withWorkspace(async (workspaceRoot) => {
      const pool = adapter === "postgres" ? await memoryPool() : undefined;
      if (pool)
        await pool.query(
          `INSERT INTO "user" (id,name,email) VALUES ('owner','Owner','owner@example.test'),('foreign','Foreign','foreign@example.test')`,
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
      const repository = make();
      const server = createCadMcpServer(repository);
      const client = new Client({ name: "file-tools", version: "1" });
      const [clientTransport, serverTransport] =
        InMemoryTransport.createLinkedPair();
      try {
        await server.connect(serverTransport);
        await client.connect(clientTransport);
        const call = async (name, args, code) => {
          const result = await client.callTool({ name, arguments: args });
          const value =
            result.structuredContent ?? JSON.parse(result.content[0].text);
          if (code) {
            assert.equal(result.isError, true);
            assert.equal(value.error.code, code, JSON.stringify(value));
            return value;
          }
          assert.ok(!result.isError, JSON.stringify(value));
          return value;
        };
        const { projectId } = await repository.createProject({
          name: "Files",
          description: "Operations",
        });
        assert.deepEqual(await call("list_model_files", { projectId }), {
          revision: null,
          state: null,
        });
        const first = await accept(
          repository,
          await repository.proposeModelSource({
            projectId,
            parentRevision: null,
            modelFiles: snapshot,
            parameters: [width],
            requestId: "genesis",
            toolCallId: "genesis",
          }),
        );
        const args = {
          projectId,
          parentRevision: first.revisionId,
          requestId: "edit",
          toolCallId: "edit",
          operations: [
            {
              op: "create_file",
              file: { id: "c", name: "C", body: "sphere(width);" },
            },
            {
              op: "create_object",
              object: { id: "c", name: "C", fileId: "c" },
            },
            { op: "update_file", id: "c", body: "sphere(width/2);" },
            { op: "update_object", id: "c", fileId: "b" },
            { op: "rename_file", id: "a", name: "Base source" },
            { op: "rename_object", id: "a", name: "Base" },
            { op: "set_file_visibility", id: "c", visible: false },
            { op: "set_object_visibility", id: "b", visible: false },
            { op: "reorder_files", ids: ["c", "b", "a"] },
            { op: "reorder_objects", ids: ["c", "b", "a"] },
          ],
        };
        const edited = await call("edit_model_files", args);
        assert.equal(edited.candidate.modelFiles, undefined);
        assert.equal(edited.state.files[0].body, undefined);
        assert.deepEqual(edited.state.presentation.objectOrder, [
          "c",
          "b",
          "a",
        ]);
        assert.deepEqual(edited.state.composition.objectIds, ["a", "b", "c"]);
        assert.equal(
          (await repository.getProjectState(projectId)).currentRevision,
          first.revisionId,
        );
        const stored = await repository.getCandidate(
          projectId,
          edited.candidate.candidateId,
        );
        assert.deepEqual(stored.parameters, [width]);
        assert.equal(
          (await call("edit_model_files", args)).candidate.candidateId,
          stored.candidateId,
        );
        const second = await accept(repository, stored);
        assert.equal(
          (await call("edit_model_files", args)).candidate.candidateId,
          stored.candidateId,
        );
        const reopened = await make().readModelSource(projectId);
        assert.deepEqual(reopened.modelFiles, stored.modelFiles);
        assert.deepEqual(
          (await call("list_model_objects", { projectId })).state,
          edited.state,
        );
        assert.equal(
          (await call("read_model_file", { projectId, fileId: "c" })).file.body,
          "sphere(width/2);",
        );
        assert.equal(
          (await call("read_model_object", { projectId, objectId: "c" })).file
            .id,
          "b",
        );
        assert.equal(
          (
            await call("read_model_file", {
              projectId,
              fileId: "a",
              revision: first.revisionId,
            })
          ).file.name,
          "A",
        );
        for (const operations of [
          [{ op: "remove_file", id: "a" }],
          [{ op: "rename_object", id: "missing", name: "X" }],
          [{ op: "set_object_visibility", id: "a", visible: false }],
          [{ op: "reorder_objects", ids: ["a", "a", "b"] }],
        ]) {
          await call(
            "edit_model_files",
            {
              ...args,
              parentRevision: second.revisionId,
              requestId: `invalid-${operations[0].op}`,
              operations,
            },
            "INVALID_MODEL_FILES",
          );
          assert.equal(
            (await repository.getProjectState(projectId)).currentRevision,
            second.revisionId,
          );
        }
        const removed = await call("edit_model_files", {
          ...args,
          parentRevision: second.revisionId,
          requestId: "remove",
          operations: [
            { op: "remove_object", id: "c" },
            { op: "remove_file", id: "c" },
            { op: "set_object_visibility", id: "b", visible: true },
          ],
        });
        const third = await accept(
          repository,
          await repository.getCandidate(
            projectId,
            removed.candidate.candidateId,
          ),
        );
        assert.equal(removed.state.files.length, 2);
        assert.deepEqual(removed.state.presentation.hiddenObjectIds, []);
        const reordered = await call("edit_model_files", {
          ...args,
          parentRevision: third.revisionId,
          requestId: "reorder",
          operations: [{ op: "reorder_objects", ids: ["a", "b"] }],
        });
        assert.equal(reordered.candidate.sourceHash, third.sourceHash);
        const restored = await repository.restoreRevision({
          projectId,
          revision: first.revisionId,
          requestId: "restore",
          toolCallId: "restore",
        });
        assert.equal(restored.sourceHash, first.sourceHash);
        assert.deepEqual(
          (await repository.readModelSource(projectId)).modelFiles,
          snapshot,
        );
        await call(
          "read_model_file",
          { projectId, fileId: "missing" },
          "INVALID_MODEL_FILES",
        );
        if (pool) {
          const foreign = createCadToolRegistry(
            new PostgresModelProjectRepository({
              pool,
              ownerId: "foreign",
              renderer,
              acceptRendererProvenance: () => true,
            }),
          );
          for (const [name, input] of [
            ["list_model_files", { projectId }],
            ["read_model_file", { projectId, fileId: "a" }],
            ["read_model_object", { projectId, objectId: "a" }],
            ["edit_model_files", args],
          ]) {
            const result = await invokeCadTool(foreign, name, input);
            assert.equal(result.ok, false);
            assert.equal(result.error.code, "PROJECT_NOT_FOUND");
          }
        }
      } finally {
        await client.close();
        await server.close();
        await pool?.end();
      }
    });
  });
