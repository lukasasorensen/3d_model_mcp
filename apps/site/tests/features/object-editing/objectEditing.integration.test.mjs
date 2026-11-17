import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  ModelProjectRepository,
  PostgresModelProjectRepository,
} from "@theoryfoundry/model-project";
import { copyModelObject, pasteModelObject } from "@theoryfoundry/contracts";
import { createInMemoryCadMcpClient } from "@theoryfoundry/runtime";
import { createObjectEditingHandlers } from "../../../src/features/object-editing/controllers/objectEditing.controller.ts";
import { createPostgresFixture } from "../../../../../packages/runtime/tests/fixtures/postgres.fixture.mjs";
import { renderer as validRenderer } from "../../../../../packages/runtime/model-project/tests/fixtures/fileProject.fixture.mjs";
const origin =
  process.env.THEORYFOUNDRY_ALLOWED_ORIGIN ?? "http://localhost:3000";
const parameters = [
  {
    id: "width",
    binding: "width",
    label: "Width",
    type: "number",
    value: 5,
    defaultValue: 5,
  },
];
const modelFiles = {
  version: 1,
  files: [{ id: "f", name: "Part", body: "cube(width);" }],
  objects: [{ id: "o", name: "Part", fileId: "f" }],
  composition: { operation: "union", objectIds: ["o"] },
};
for (const adapter of ["filesystem", "database"])
  test(`${adapter}: object HTTP lifecycle saves, retries, rejects, copies, undoes and redoes revision-bound snapshots`, async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "object-editing-"));
    const database =
      adapter === "database" ? await createPostgresFixture() : undefined;
    let reject = false;
    let renders = 0;
    const renderer = {
      async validateAndRender(input) {
        renders++;
        const result = await validRenderer.validateAndRender(input);
        return reject
          ? {
              ...result,
              outcome: "REJECTED",
              artifacts: [],
              diagnostics: [
                {
                  severity: "error",
                  code: "INVALID_GEOMETRY",
                  message: "ERROR: Object rejected.",
                },
              ],
            }
          : result;
      },
    };
    if (database)
      await database.pool.query(
        `INSERT INTO "user" (id,name,email) VALUES ('owner','Owner','owner@example.test'),('other','Other','other@example.test')`,
      );
    const make = (ownerId = "owner") =>
      database
        ? new PostgresModelProjectRepository({
            pool: database.pool,
            ownerId,
            renderer,
            acceptRendererProvenance: () => true,
          })
        : new ModelProjectRepository({
            workspaceRoot,
            renderer,
            acceptRendererProvenance: () => true,
          });
    const repository = make();
    const client = await createInMemoryCadMcpClient(repository);
    let subscriptions = 0;
    const runtime = {
      client,
      browserRenderer: {
        subscribe() {
          subscriptions++;
          return () => {
            subscriptions--;
          };
        },
      },
    };
    const handlers = createObjectEditingHandlers({
      authenticate: async () => ({ id: "owner" }),
      withRuntime: async (owner, action) => {
        assert.equal(owner, "owner");
        return action(runtime);
      },
    });
    const { projectId } = await repository.createProject({
      name: "Objects",
      description: "Editing",
    });
    const context = { params: Promise.resolve({ projectId }) };
    const url = `${origin}/v1/projects/${projectId}/objects`;
    const apply = async (parentRevision, files, requestId) => {
      const response = await handlers.POST(
        new Request(url, {
          method: "POST",
          headers: { origin, "x-theoryfoundry-session-id": "session" },
          body: JSON.stringify({
            parentRevision,
            requestId,
            sessionId: "session",
            modelFiles: files,
          }),
        }),
        context,
      );
      assert.equal(response.status, 200);
      const events = (await response.text())
        .trim()
        .split("\n")
        .filter(Boolean)
        .map(JSON.parse);
      events.forEach((event, i) => {
        assert.equal(event.sequence, i);
        assert.equal(event.requestId, requestId);
      });
      assert.equal(subscriptions, 0);
      return events.at(-1);
    };
    const accept = async (proposal) => {
      const candidate = await repository.proposeModelSource(proposal);
      await repository.validateAndRender({
        projectId,
        candidateId: candidate.candidateId,
        previewProfile: "standard",
      });
      return repository.promoteCandidate({
        projectId,
        candidateId: candidate.candidateId,
        expectedParentRevision: proposal.parentRevision,
      });
    };
    try {
      assert.deepEqual(
        await (await handlers.GET(new Request(url), context)).json(),
        { revision: null, sourceHash: null, modelFiles: null, parameters: [] },
      );
      const first = await accept({
        projectId,
        parentRevision: null,
        modelFiles,
        parameters,
        requestId: "first",
        toolCallId: "first",
      });
      const moved = structuredClone(modelFiles);
      moved.objects[0].transform = {
        position: [10, 20, 30],
        rotation: [15, 30, 45],
        scale: [2, 1, 0.5],
      };
      const saved = await apply(first.revisionId, moved, "move");
      assert.equal(saved.type, "saved");
      const reloaded = await (
        await handlers.GET(new Request(url), context)
      ).json();
      assert.deepEqual(reloaded.modelFiles, moved);
      assert.deepEqual(reloaded.parameters, parameters);
      assert.equal(reloaded.revision, saved.revision);
      const previousRenders = renders;
      assert.equal(
        (await apply(first.revisionId, moved, "move")).revision,
        saved.revision,
      );
      assert.equal(renders, previousRenders);
      assert.equal(
        (await apply(first.revisionId, modelFiles, "stale")).error.code,
        "STALE_REVISION",
      );
      reject = true;
      assert.equal(
        (await apply(saved.revision, modelFiles, "reject")).error.code,
        "MODEL_REJECTED",
      );
      assert.equal(
        (await repository.getProjectState(projectId)).currentRevision,
        saved.revision,
      );
      reject = false;
      const clipboard = copyModelObject({
        projectId,
        modelFiles: moved,
        objectId: "o",
        parameters,
      });
      assert.equal(
        (await repository.getProjectState(projectId)).currentRevision,
        saved.revision,
      );
      const pasted = pasteModelObject({
        projectId,
        modelFiles: moved,
        clipboard,
        objectId: "o-copy",
        fileId: "f-copy",
        parameters,
      });
      const pastedResult = await apply(saved.revision, pasted, "paste");
      assert.equal(pastedResult.type, "saved");
      assert.equal(pasted.files.length, 2);
      assert.deepEqual(
        pasted.objects.find((object) => object.id === "o"),
        moved.objects[0],
      );
      const undo = await apply(pastedResult.revision, moved, "undo");
      assert.equal(undo.type, "saved");
      assert.deepEqual(
        (await repository.readModelSource(projectId)).modelFiles,
        moved,
      );
      const redo = await apply(undo.revision, pasted, "redo");
      assert.equal(redo.type, "saved");
      assert.deepEqual(
        (await repository.readModelSource(projectId)).modelFiles,
        pasted,
      );
      // Historical reads retain the original object set and source bytes.
      assert.deepEqual(
        (
          await (
            await handlers.GET(
              new Request(`${url}?revision=${first.revisionId}`),
              context,
            )
          ).json()
        ).modelFiles,
        modelFiles,
      );
      if (database) {
        const otherClient = await createInMemoryCadMcpClient(make("other"));
        try {
          const other = createObjectEditingHandlers({
            authenticate: async () => ({ id: "other" }),
            withRuntime: async (_id, action) =>
              action({ ...runtime, client: otherClient }),
          });
          assert.equal(
            (await other.GET(new Request(url), context)).status,
            404,
          );
        } finally {
          await otherClient.close();
        }
      }
    } finally {
      await client.close();
      await database?.close();
      await rm(workspaceRoot, { recursive: true, force: true });
    }
  });
