import assert from "node:assert/strict";
import test from "node:test";
import {
  ModelProjectRepository,
  PostgresModelProjectRepository,
} from "@theoryfoundry/model-project";
import { createInMemoryCadMcpClient } from "@theoryfoundry/runtime";
import { applyModelFileOperations } from "@theoryfoundry/contracts";
import { createWorkingModelHandler } from "../../../src/features/working-model/index.ts";
import { createPostgresFixture } from "../../../../../packages/runtime/tests/fixtures/postgres.fixture.mjs";
import {
  renderer,
  withWorkspace,
} from "../../../../../packages/runtime/model-project/tests/fixtures/fileProject.fixture.mjs";

const origin =
  process.env.THEORYFOUNDRY_ALLOWED_ORIGIN ?? "http://localhost:3000";
const modelFiles = {
  version: 1,
  files: [
    { id: "a", name: "Body.scad", body: "cube([width,10,5]);" },
    { id: "b", name: "Cap.scad", body: "translate([15,0,0])cube(5);" },
    { id: "c", name: "Pin.scad", body: "cylinder(h=5,r=2);" },
  ],
  objects: [
    { id: "body", name: "Body", fileId: "a" },
    { id: "cap", name: "Cap", fileId: "b" },
    { id: "pin", name: "Pin", fileId: "c" },
  ],
  composition: { operation: "union", objectIds: ["body", "cap", "pin"] },
};
const width = {
  id: "width",
  binding: "width",
  label: "Width",
  type: "number",
  value: 20,
  defaultValue: 10,
  min: 1,
};

for (const adapter of ["filesystem", "database"])
  test(
    adapter +
      ": mixed draft previews are transient and Save is atomic and retryable",
    async () => {
      await withWorkspace(async (workspaceRoot) => {
        const database =
          adapter === "database" ? await createPostgresFixture() : undefined;
        const models = [];
        let beforeRender;
        const validateRenderer = {
          async validateAndRender(input) {
            models.push(input.source);
            await beforeRender?.();
            return renderer.validateAndRender(input);
          },
        };
        const options = {
          acceptRendererProvenance: () => true,
          renderer: validateRenderer,
        };
        const store = (ownerId) =>
          database
            ? new PostgresModelProjectRepository({
                ...options,
                ownerId,
                pool: database.pool,
              })
            : new ModelProjectRepository({ ...options, workspaceRoot });
        const repository = store("owner");
        const client = await createInMemoryCadMcpClient(repository);
        try {
          if (database)
            await database.pool.query(
              "INSERT INTO \"user\" (id,name,email) VALUES ('owner','Owner','owner@example.test'),('other','Other','other@example.test')",
            );
          const { projectId } = await repository.createProject({
            name: "Draft",
            description: "Mixed model",
          });
          const context = { params: Promise.resolve({ projectId }) };
          const create = async (
            parentRevision,
            requestId,
            fileSnapshot,
            parameters,
          ) => {
            const candidate = await repository.proposeModelSource({
              projectId,
              parentRevision,
              requestId,
              toolCallId: requestId,
              modelFiles: fileSnapshot,
              parameters,
            });
            await repository.validateAndRender({
              projectId,
              candidateId: candidate.candidateId,
              previewProfile: "standard",
            });
            return repository.promoteCandidate({
              projectId,
              candidateId: candidate.candidateId,
              expectedParentRevision: parentRevision,
            });
          };
          const first = await create(null, "initial", modelFiles, [width]);
          const handlers = Object.fromEntries(
            ["preview", "save"].map((mode) => [
              mode,
              createWorkingModelHandler(
                {
                  authenticate: async (request) => ({
                    id: request.headers.get("x-fixture-owner") ?? "owner",
                  }),
                  withRuntime: async (owner, run) =>
                    run({
                      repository: owner === "owner" ? repository : store(owner),
                      client,
                      browserRenderer: { subscribe: () => () => {} },
                    }),
                },
                mode,
              ),
            ]),
          );
          const request = async (mode, input, extraHeaders) =>
            handlers[mode](
              new Request(
                origin + "/v1/projects/" + projectId + "/draft/" + mode,
                {
                  method: "POST",
                  headers: {
                    origin,
                    "x-theoryfoundry-session-id": "session",
                    ...extraHeaders,
                  },
                  body: JSON.stringify(input),
                },
              ),
              context,
            );
          const payload = {
            parentRevision: first.revisionId,
            operations: [{ op: "set_value", id: "width", value: 30 }],
            modelFiles: applyModelFileOperations(modelFiles, [
              { op: "rename_object", id: "pin", name: "Shifted pin" },
              { op: "set_object_visibility", id: "cap", visible: false },
              { op: "reorder_objects", ids: ["pin", "body", "cap"] },
              {
                op: "set_object_transform",
                id: "pin",
                transform: {
                  position: [6, 0, 0],
                  scale: [1, 1, 1],
                  rotation: [0, 0, 0],
                },
              },
            ]),
          };
          const save = async (draft, requestId) => {
            const response = await request("save", {
              ...draft,
              requestId,
              sessionId: "session",
            });
            assert.equal(response.status, 200);
            return (await response.text())
              .trim()
              .split("\n")
              .map(JSON.parse)
              .at(-1);
          };
          await request("preview", { ...payload, operations: [] });
          const prepared = await request("preview", payload);
          assert.equal(prepared.status, 200);
          const preview = await prepared.json();
          assert.match(preview.source, /width = 30;/);
          assert.match(preview.source, /translate\(\[6,0,0\]\)/);
          assert.doesNotMatch(preview.source, /translate\(\[15,0,0\]\)/);
          assert.equal(models.length, 1);
          assert.equal((await repository.listRevisions(projectId)).length, 1);

          const invalid = {
            ...payload,
            operations: [{ op: "set_value", id: "width", value: 0 }],
          };
          assert.equal((await request("preview", invalid)).status, 422);
          assert.equal((await save(invalid, "invalid")).type, "error");
          if (database)
            assert.equal(
              (
                await request("preview", payload, {
                  "x-fixture-owner": "other",
                })
              ).status,
              404,
            );
          const wrongSession = await request("save", {
            ...payload,
            requestId: "wrong-session",
            sessionId: "other",
          });
          assert.equal(wrongSession.status, 409);
          assert.equal((await save(payload, "save-edits")).type, "saved");
          const retry = await save(payload, "save-edits");
          assert.equal(retry.type, "saved");
          assert.equal(models.length, 2);
          const reopened = await store("owner").readModelSource(projectId);
          assert.equal(reopened.revision, retry.revision);
          assert.deepEqual(reopened.modelFiles, payload.modelFiles);
          assert.equal(reopened.parameters[0].value, 30);
          assert.equal(reopened.sourceHash, preview.sourceHash);
          assert.equal((await repository.listRevisions(projectId)).length, 2);

          const stale = await save(payload, "stale");
          assert.equal(stale.type, "error");
          assert.equal(stale.error.code, "STALE_REVISION");
          assert.equal((await repository.listRevisions(projectId)).length, 2);

          const rename = {
            parentRevision: reopened.revision,
            operations: [],
            modelFiles: applyModelFileOperations(reopened.modelFiles, [
              { op: "rename_object", id: "pin", name: "New pin label" },
            ]),
          };
          assert.equal(
            (await (await request("preview", rename)).json()).sourceHash,
            preview.sourceHash,
          );
          beforeRender = async () => {
            beforeRender = undefined;
            await create(
              reopened.revision,
              "competing-mcp",
              reopened.modelFiles,
              reopened.parameters,
            );
          };
          const raced = await save(rename, "racing-editor");
          assert.equal(raced.type, "error");
          assert.equal(raced.error.code, "STALE_REVISION");
          assert.equal((await repository.listRevisions(projectId)).length, 3);
        } finally {
          await client.close();
          await database?.close();
        }
      });
    },
  );
