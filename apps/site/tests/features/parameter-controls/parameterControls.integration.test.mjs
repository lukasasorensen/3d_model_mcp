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
import { createParameterControlsHandlers } from "../../../src/features/parameter-controls/controllers/parameterControls.controller.ts";
import { createPostgresFixture } from "../../../../../packages/runtime/tests/fixtures/postgres.fixture.mjs";
import { renderer as validRenderer } from "../../../../../packages/runtime/model-project/tests/fixtures/fileProject.fixture.mjs";

const origin =
  process.env.THEORYFOUNDRY_ALLOWED_ORIGIN ?? "http://localhost:3000";
const width = {
  id: "width",
  binding: "width",
  label: "Width",
  type: "number",
  value: 20,
  defaultValue: 10,
  min: 1,
  max: 100,
};
const modelBody = "// unchanged\r\ncube([width,10,5]);\n";

for (const adapter of ["filesystem", "database"])
  test(`${adapter}: HTTP Apply uses actual MCP lifecycle, preserves body and reconciles replay, rejection, cancellation and competing writers`, async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "parameter-controls-"));
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
        const valid = await validRenderer.validateAndRender(input);
        return failure === "reject"
          ? {
              ...valid,
              outcome: "REJECTED",
              artifacts: [],
              diagnostics: [
                {
                  severity: "error",
                  code: "MODEL_ASSERTION",
                  message: "Width is not printable.",
                },
              ],
            }
          : valid;
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
    const handlers = createParameterControlsHandlers({
      authenticate: async () => ({ id: "owner" }),
      withRuntime: async (owner, action) => {
        assert.equal(owner, "owner");
        return action(runtime);
      },
    });
    const { projectId } = await repository.createProject({
      name: "Controls",
      description: "Lifecycle",
    });
    const context = { params: Promise.resolve({ projectId }) };
    const url = `${origin}/v1/projects/${projectId}/parameters`;
    const apply = async (
      parentRevision,
      value,
      requestId = `request-${value}`,
      controller,
    ) => {
      const response = await handlers.POST(
        new Request(url, {
          method: "POST",
          signal: controller?.signal,
          headers: { origin, "x-theoryfoundry-session-id": "session" },
          body: JSON.stringify({
            parentRevision,
            requestId,
            sessionId: "session",
            operations: [{ op: "set_value", id: "width", value }],
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
        { revision: null, sourceHash: null, editable: false, parameters: [] },
      );
      const first = await accept({
        projectId,
        parentRevision: null,
        modelBody,
        parameters: [width],
        requestId: "genesis",
        toolCallId: "genesis",
      });
      const read = await (await handlers.GET(new Request(url), context)).json();
      assert.equal(read.revision, first.revisionId);
      assert.equal(read.editable, true);
      assert.equal("modelBody" in read, false);
      assert.equal(
        (await apply(first.revisionId, 0)).error.code,
        "INVALID_PARAMETERS",
      );
      assert.equal(
        (await repository.getProjectState(projectId)).currentRevision,
        first.revisionId,
      );
      const saved = await apply(first.revisionId, 30);
      assert.equal(saved.type, "saved");
      const accepted = await repository.readModelSource(projectId);
      assert.equal(accepted.modelBody, modelBody);
      assert.equal(accepted.parameters[0].value, 30);
      assert.equal(accepted.parameters[0].defaultValue, 10);
      const next = await apply(saved.revision, 40);
      const count = renders;
      assert.equal(
        (await apply(first.revisionId, 30)).revision,
        saved.revision,
      );
      assert.equal(renders, count);
      assert.equal(
        (await repository.getProjectState(projectId)).currentRevision,
        next.revision,
      );
      assert.equal(
        (await apply(first.revisionId, 35, "request-30")).error.code,
        "STALE_REVISION",
      );
      failure = "reject";
      assert.equal(
        (await apply(next.revision, 50)).error.code,
        "MODEL_REJECTED",
      );
      failure = undefined;
      assert.equal(
        (await apply(next.revision, 50)).error.code,
        "MODEL_REJECTED",
      );
      failure = "cancel";
      assert.equal((await apply(next.revision, 60)).error.code, "CANCELLED");
      failure = undefined;
      assert.equal(
        (await repository.getProjectState(projectId)).currentRevision,
        next.revision,
      );
      const restored = await repository.restoreRevision({
        projectId,
        revision: first.revisionId,
        requestId: "restore",
        toolCallId: "restore",
      });
      assert.equal(
        (await make().readModelSource(projectId)).parameters[0].value,
        20,
      );
      // A competing AI proposal wins while the UI candidate is validating.
      let winner;
      beforeRender = async () => {
        beforeRender = undefined;
        winner = await accept({
          projectId,
          parentRevision: restored.revisionId,
          modelBody,
          parameters: [{ ...width, value: 25 }],
          requestId: "ai",
          toolCallId: "ai",
        });
      };
      assert.equal(
        (await apply(restored.revisionId, 70)).error.code,
        "STALE_REVISION",
      );
      assert.equal(
        (await repository.getProjectState(projectId)).currentRevision,
        winner.revisionId,
      );
      assert.equal(
        (await repository.readModelSource(projectId)).parameters[0].value,
        25,
      );
      if (database) {
        const foreign = await createInMemoryCadMcpClient(make("other"));
        try {
          const isolated = createParameterControlsHandlers({
            authenticate: async () => ({ id: "other" }),
            withRuntime: async (_, run) => run({ ...runtime, client: foreign }),
          });
          assert.equal(
            (await isolated.GET(new Request(url), context)).status,
            404,
          );
        } finally {
          await foreign.close();
        }
      }
      const { projectId: legacyId } = await repository.createProject({
        name: "Legacy",
        description: "No adoption",
      });
      const legacyContext = {
        params: Promise.resolve({ projectId: legacyId }),
      };
      const legacy = await repository.proposeModelSource({
        projectId: legacyId,
        parentRevision: null,
        source: "cube(1);",
        requestId: "legacy",
        toolCallId: "legacy",
      });
      await repository.validateAndRender({
        projectId: legacyId,
        candidateId: legacy.candidateId,
        previewProfile: "standard",
      });
      await repository.promoteCandidate({
        projectId: legacyId,
        candidateId: legacy.candidateId,
        expectedParentRevision: null,
      });
      assert.equal(
        (await (await handlers.GET(new Request(url), legacyContext)).json())
          .editable,
        false,
      );
    } finally {
      await client.close();
      await database?.close();
      await rm(workspaceRoot, { recursive: true, force: true });
    }
  });
