import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  ModelProjectRepository,
  PostgresModelProjectRepository,
  CadDomainError,
} from "@theoryfoundry/model-project";
import { createInMemoryCadMcpClient } from "@theoryfoundry/runtime";
import { createObjectLayersHandlers } from "../../../src/features/object-layers/controllers/objectLayers.controller.ts";
import { createPostgresFixture } from "../../../../../packages/runtime/tests/fixtures/postgres.fixture.mjs";
import { renderer as validRenderer } from "../../../../../packages/runtime/model-project/tests/fixtures/fileProject.fixture.mjs";
const origin =
  process.env.THEORYFOUNDRY_ALLOWED_ORIGIN ?? "http://localhost:3000";
const modelFiles = {
  version: 1,
  files: [
    { id: "a", name: "Body.scad", body: "cube(10);" },
    { id: "b", name: "Lid.scad", body: "translate([15,0,0])cube(5);" },
  ],
  objects: [
    { id: "body", name: "Body", fileId: "a" },
    { id: "lid", name: "Lid", fileId: "b" },
  ],
  composition: { operation: "union", objectIds: ["body", "lid"] },
};
for (const adapter of ["filesystem", "database"])
  test(`${adapter}: layers HTTP follows actual MCP candidate lifecycle, ownership and stale/failure semantics`, async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "object-layers-"));
    const database =
      adapter === "database" ? await createPostgresFixture() : undefined;
    let failure;
    let beforeRender;
    let renders = 0;
    const renderer = {
      async validateAndRender(input) {
        renders++;
        await beforeRender?.();
        if (failure === "cancel")
          throw new CadDomainError("CANCELLED", "Cancelled fixture");
        const result = await validRenderer.validateAndRender(input);
        return failure === "reject"
          ? {
              ...result,
              outcome: "REJECTED",
              artifacts: [],
              diagnostics: [
                {
                  severity: "error",
                  code: "INVALID_GEOMETRY",
                  message: "Visible model rejected.",
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
    const handlers = createObjectLayersHandlers({
      authenticate: async () => ({ id: "owner" }),
      withRuntime: async (owner, run) => {
        assert.equal(owner, "owner");
        return run(runtime);
      },
    });
    const { projectId } = await repository.createProject({
      name: "Layers",
      description: "Lifecycle",
    });
    const context = { params: Promise.resolve({ projectId }) };
    const url = `${origin}/v1/projects/${projectId}/layers`;
    const accept = async (parentRevision, requestId, files = modelFiles) => {
      const candidate = await repository.proposeModelSource({
        projectId,
        parentRevision,
        modelFiles: files,
        requestId,
        toolCallId: requestId,
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
    const apply = async (parentRevision, operations, requestId) => {
      const response = await handlers.POST(
        new Request(url, {
          method: "POST",
          headers: { origin, "x-theoryfoundry-session-id": "session" },
          body: JSON.stringify({
            parentRevision,
            operations,
            requestId,
            sessionId: "session",
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
      events.forEach((event, index) => {
        assert.equal(event.sequence, index);
        assert.equal(event.requestId, requestId);
      });
      assert.equal(subscriptions, 0);
      return events.at(-1);
    };
    const visibility = (visible) => [
      { op: "set_object_visibility", id: "lid", visible },
    ];
    try {
      assert.deepEqual(
        await (await handlers.GET(new Request(url), context)).json(),
        { revision: null, sourceHash: null, state: null },
      );
      const first = await accept(null, "genesis");
      const read = await (await handlers.GET(new Request(url), context)).json();
      assert.equal(read.revision, first.revisionId);
      assert.equal(read.state.files[0].body, undefined);
      assert.deepEqual(read.state.presentation.objectOrder, ["body", "lid"]);
      const rename = { op: "rename_object", id: "lid", name: "New lid" };
      const saved = await apply(
        first.revisionId,
        [
          rename,
          ...visibility(false),
          { op: "reorder_objects", ids: ["lid", "body"] },
        ],
        "hide-reorder",
      );
      assert.equal(saved.type, "saved");
      const current = await make().readModelSource(projectId);
      assert.deepEqual(current.modelFiles.presentation.hiddenObjectIds, [
        "lid",
      ]);
      assert.deepEqual(current.modelFiles.presentation.objectOrder, [
        "lid",
        "body",
      ]);
      assert.deepEqual(
        current.modelFiles.objects.find((o) => o.id === "lid"),
        { id: "lid", name: "New lid", fileId: "b" },
      );
      assert.deepEqual(current.modelFiles.composition, modelFiles.composition);
      assert.equal(current.source.includes("translate([15,0,0])"), false);
      const count = renders;
      assert.equal(
        (
          await apply(
            first.revisionId,
            [
              rename,
              ...visibility(false),
              { op: "reorder_objects", ids: ["lid", "body"] },
            ],
            "hide-reorder",
          )
        ).revision,
        saved.revision,
      );
      assert.equal(renders, count);
      const orderOnly = await apply(
        saved.revision,
        [{ op: "reorder_objects", ids: ["body", "lid"] }],
        "order",
      );
      assert.equal(orderOnly.type, "saved");
      assert.equal(
        (await repository.readModelSource(projectId)).source,
        current.source,
      );
      failure = "reject";
      assert.equal(
        (await apply(orderOnly.revision, visibility(true), "reject")).error
          .code,
        "MODEL_REJECTED",
      );
      failure = "cancel";
      assert.equal(
        (await apply(orderOnly.revision, visibility(true), "cancel")).error
          .code,
        "CANCELLED",
      );
      failure = undefined;
      assert.equal(
        (await repository.getProjectState(projectId)).currentRevision,
        orderOnly.revision,
      );
      const empty = await apply(
        orderOnly.revision,
        [{ op: "set_object_visibility", id: "body", visible: false }],
        "empty",
      );
      assert.equal(empty.type, "error");
      assert.equal(
        (await repository.getProjectState(projectId)).currentRevision,
        orderOnly.revision,
      );
      let winner;
      beforeRender = async () => {
        beforeRender = undefined;
        winner = await accept(orderOnly.revision, "competing");
      };
      assert.equal(
        (await apply(orderOnly.revision, visibility(true), "stale")).error.code,
        "STALE_REVISION",
      );
      assert.equal(
        (await repository.getProjectState(projectId)).currentRevision,
        winner.revisionId,
      );
      const historical = await (
        await handlers.GET(
          new Request(`${url}?revision=${saved.revision}`),
          context,
        )
      ).json();
      assert.deepEqual(historical.state.presentation.hiddenObjectIds, ["lid"]);
      assert.equal(
        (
          await handlers.POST(
            new Request(url, {
              method: "POST",
              headers: { origin: "https://foreign.test" },
              body: "{}",
            }),
            context,
          )
        ).status,
        403,
      );
      assert.equal(
        (
          await handlers.POST(
            new Request(url, {
              method: "POST",
              headers: {
                origin,
                "x-theoryfoundry-session-id": "other-session",
              },
              body: JSON.stringify({
                parentRevision: winner.revisionId,
                operations: visibility(false),
                requestId: "session-mismatch",
                sessionId: "session",
              }),
            }),
            context,
          )
        ).status,
        409,
      );
      const unauthorized = createObjectLayersHandlers({
        authenticate: async () => new Response(null, { status: 401 }),
        withRuntime: async () => {
          throw new Error("Should not open runtime");
        },
      });
      assert.equal(
        (await unauthorized.GET(new Request(url), context)).status,
        401,
      );
      if (database) {
        const foreign = await createInMemoryCadMcpClient(make("other"));
        try {
          const isolated = createObjectLayersHandlers({
            authenticate: async () => ({ id: "other" }),
            withRuntime: async (_, run) => run({ ...runtime, client: foreign }),
          });
          assert.equal(
            (await isolated.GET(new Request(url), context)).status,
            404,
          );
          const response = await isolated.POST(
            new Request(url, {
              method: "POST",
              headers: { origin, "x-theoryfoundry-session-id": "session" },
              body: JSON.stringify({
                parentRevision: winner.revisionId,
                operations: visibility(false),
                requestId: "foreign",
                sessionId: "session",
              }),
            }),
            context,
          );
          assert.equal(
            (await response.text()).includes("PROJECT_NOT_FOUND"),
            true,
          );
        } finally {
          await foreign.close();
        }
      }
    } finally {
      await client.close();
      await database?.close();
      await rm(workspaceRoot, { recursive: true, force: true });
    }
  });
