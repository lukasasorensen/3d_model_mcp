import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createCadMcpServer } from "@theoryfoundry/mcp";
import {
  ModelProjectRepository,
  PostgresModelProjectRepository,
  CadDomainError,
} from "@theoryfoundry/model-project";
import { createPostgresFixture } from "../../fixtures/postgres.fixture.mjs";
import { renderer as validRenderer } from "../../../model-project/tests/fixtures/fileProject.fixture.mjs";

const width = {
  id: "width",
  binding: "width",
  label: "Width",
  type: "number",
  value: 20,
  defaultValue: 10,
};
const body = "// preserved bytes\r\ncube([width, 10, 5]);\n";

for (const adapter of ["filesystem", "postgres"])
  test(`${adapter}: MCP parameter CRUD preserves atomic state, immutable retries and owner boundaries`, async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "parameter-tools-"));
    const database =
      adapter === "postgres" ? await createPostgresFixture() : undefined;
    let failure;
    const renderer = {
      async validateAndRender(input) {
        if (failure === "CANCELLED")
          throw new CadDomainError("CANCELLED", "Injected cancellation");
        const result = await validRenderer.validateAndRender(input);
        return failure === "REJECTED"
          ? {
              ...result,
              outcome: "REJECTED",
              artifacts: [],
              diagnostics: [
                {
                  code: "MODEL_ASSERTION",
                  severity: "error",
                  message: "Injected assertion",
                },
              ],
            }
          : result;
      },
    };
    if (database)
      await database.pool.query(
        `INSERT INTO "user" (id,name,email) VALUES ('a','A','a@example.test'),('b','B','b@example.test')`,
      );
    const make = (ownerId = "a") =>
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
    const server = createCadMcpServer(repository);
    const client = new Client({ name: "parameter-tools-test", version: "1" });
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();
    let sequence = 0;
    async function call(name, args, errorCode) {
      const result = await client.callTool({ name, arguments: args });
      if (errorCode === "INVALID_TOOL_INPUT" && !result.structuredContent) {
        assert.equal(result.isError, true);
        assert.match(result.content[0].text, /validation|Each parameter/i);
        return {};
      }
      const value =
        result.structuredContent ?? JSON.parse(result.content[0].text);
      if (errorCode) {
        assert.equal(result.isError, true, JSON.stringify(result));
        assert.equal(value.error.code, errorCode, JSON.stringify(value));
      } else assert.ok(!result.isError, JSON.stringify(result));
      return value;
    }
    try {
      await server.connect(serverTransport);
      await client.connect(clientTransport);
      const catalog = await client.listTools();
      for (const name of ["list_model_parameters", "edit_parameters"])
        assert.ok(catalog.tools.some((tool) => tool.name === name));
      const { projectId } = await repository.createProject({
        name: "Parameter tools",
        description: "Atomic edits",
      });
      const editInput = (parentRevision, operations, extra = {}) => ({
        projectId,
        parentRevision,
        operations,
        requestId: `edit-${++sequence}`,
        toolCallId: "tool",
        ...extra,
      });
      const edit = async (input, code) =>
        (await call("edit_parameters", input, code)).candidate;
      const accept = async (candidate) => {
        await call("validate_and_render", {
          projectId,
          candidateId: candidate.candidateId,
          previewProfile: "standard",
        });
        return (
          await call("promote_candidate", {
            projectId,
            candidateId: candidate.candidateId,
            expectedParentRevision: candidate.parentRevision,
          })
        ).revision;
      };
      assert.deepEqual(await call("list_model_parameters", { projectId }), {
        revision: null,
        parameters: [],
      });
      await edit(
        editInput(null, [{ op: "create", parameter: width }]),
        "INVALID_PARAMETERS",
      );
      const creation = editInput(null, [{ op: "create", parameter: width }], {
        modelBody: body,
      });
      const created = await edit(creation);
      assert.equal(created.modelBody, undefined);
      assert.equal(
        (await repository.getProjectState(projectId)).currentRevision,
        null,
      );
      const first = await accept(created);
      assert.deepEqual(await call("list_model_parameters", { projectId }), {
        revision: first.revisionId,
        parameters: [width],
      });
      assert.equal((await edit(creation)).candidateId, created.candidateId);
      const valueInput = editInput(first.revisionId, [
        { op: "set_value", id: "width", value: 30 },
      ]);
      const valueCandidate = await edit(valueInput);
      assert.equal(
        (await repository.getCandidate(projectId, valueCandidate.candidateId))
          .modelBody,
        body,
      );
      assert.equal(valueCandidate.parameters[0].defaultValue, 10);
      // A competing UI proposal uses the same parent through the general document API.
      const ui = await repository.proposeModelSource({
        projectId,
        parentRevision: first.revisionId,
        modelBody: body,
        parameters: [{ ...width, value: 40 }],
        requestId: "ui",
        toolCallId: "ui",
      });
      const second = await accept(valueCandidate);
      await call("validate_and_render", {
        projectId,
        candidateId: ui.candidateId,
        previewProfile: "standard",
      });
      await call(
        "promote_candidate",
        {
          projectId,
          candidateId: ui.candidateId,
          expectedParentRevision: first.revisionId,
        },
        "STALE_REVISION",
      );
      assert.equal(
        (await edit(valueInput)).candidateId,
        valueCandidate.candidateId,
      );
      await edit(
        {
          ...valueInput,
          operations: [{ op: "set_value", id: "width", value: 31 }],
        },
        "STALE_REVISION",
      );
      await edit({ ...valueInput, requestId: "new-request" }, "STALE_REVISION");
      await edit({ ...valueInput, toolCallId: "new-tool" }, "STALE_REVISION");
      await edit(
        { ...valueInput, modelBody: body + "// changed" },
        "STALE_REVISION",
      );
      const accepted = await repository.readModelSource(projectId);
      assert.equal(accepted.parameters[0].value, 30);
      assert.deepEqual(
        await call("list_model_parameters", {
          projectId,
          revision: first.revisionId,
        }),
        { revision: first.revisionId, parameters: [width] },
      );
      for (const operations of [
        [{ op: "delete", id: "width" }],
        [{ op: "update", parameter: { ...width, binding: "span" } }],
        [{ op: "set_value", id: "width", value: "bad" }],
        [{ op: "delete", id: "missing" }],
        [{ op: "create", parameter: width }],
      ]) {
        await edit(
          editInput(second.revisionId, operations),
          "INVALID_PARAMETERS",
        );
      }
      await call(
        "edit_parameters",
        editInput(second.revisionId, [
          { op: "delete", id: "width" },
          { op: "set_value", id: "width", value: 2 },
        ]),
        "INVALID_TOOL_INPUT",
      );
      assert.deepEqual(await repository.readModelSource(projectId), accepted);
      for (const outcome of ["REJECTED", "CANCELLED"]) {
        const candidate = await edit(
          editInput(second.revisionId, [
            { op: "set_value", id: "width", value: 50 },
          ]),
        );
        failure = outcome;
        const result = await call(
          "validate_and_render",
          {
            projectId,
            candidateId: candidate.candidateId,
            previewProfile: "standard",
          },
          outcome === "CANCELLED" ? outcome : undefined,
        );
        if (outcome === "REJECTED")
          assert.equal(result.candidate.state, "REJECTED");
        failure = undefined;
        await call(
          "promote_candidate",
          {
            projectId,
            candidateId: candidate.candidateId,
            expectedParentRevision: second.revisionId,
          },
          "INVALID_CANDIDATE_STATE",
        );
        assert.deepEqual(await repository.readModelSource(projectId), accepted);
      }
      const renamed = await accept(
        await edit(
          editInput(
            second.revisionId,
            [
              {
                op: "update",
                parameter: {
                  ...width,
                  binding: "span",
                  label: "Span",
                  value: 30,
                },
              },
            ],
            { modelBody: "cube([span, 10, 5]);" },
          ),
        ),
      );
      assert.equal(
        (await repository.readModelSource(projectId)).source.includes(
          "width =",
        ),
        false,
      );
      const removed = await accept(
        await edit(
          editInput(renamed.revisionId, [{ op: "delete", id: "width" }], {
            modelBody: "cube([30, 10, 5]);",
          }),
        ),
      );
      assert.deepEqual(await call("list_model_parameters", { projectId }), {
        revision: removed.revisionId,
        parameters: [],
      });
      const restored = (
        await call("restore_revision", {
          projectId,
          revision: second.revisionId,
          requestId: "restore",
          toolCallId: "restore",
        })
      ).revision;
      const reopened = make();
      assert.equal((await reopened.readModelSource(projectId)).modelBody, body);
      assert.equal(
        (await reopened.getProjectState(projectId)).parameters[0].value,
        30,
      );
      assert.equal(
        (await edit(valueInput)).candidateId,
        valueCandidate.candidateId,
      );
      if (database) {
        const { createCadToolRegistry, invokeCadTool } =
          await import("@theoryfoundry/mcp");
        const foreign = createCadToolRegistry(make("b"));
        for (const [name, input] of [
          ["list_model_parameters", { projectId }],
          ["list_model_parameters", { projectId, revision: first.revisionId }],
          ["edit_parameters", creation],
          ["edit_parameters", valueInput],
        ]) {
          const response = await invokeCadTool(foreign, name, input);
          assert.equal(response.ok, false);
          assert.equal(response.error.code, "PROJECT_NOT_FOUND");
        }
        assert.equal(
          (await repository.getProjectState(projectId)).currentRevision,
          restored.revisionId,
        );
      }
      const legacy = await repository.createProject({
        name: "Legacy",
        description: "Explicit adoption",
      });
      const legacyCandidate = await repository.proposeModelSource({
        projectId: legacy.projectId,
        parentRevision: null,
        source: "width=10; cube(width);",
        requestId: "legacy",
        toolCallId: "legacy",
      });
      await repository.validateAndRender({
        projectId: legacy.projectId,
        candidateId: legacyCandidate.candidateId,
        previewProfile: "standard",
      });
      const legacyRevision = await repository.promoteCandidate({
        projectId: legacy.projectId,
        candidateId: legacyCandidate.candidateId,
        expectedParentRevision: null,
      });
      const adoption = editInput(
        legacyRevision.revisionId,
        [{ op: "create", parameter: width }],
        { projectId: legacy.projectId },
      );
      await edit(adoption, "INVALID_PARAMETERS");
      await edit(
        { ...adoption, modelBody: "width=10; cube(width);" },
        "INVALID_PARAMETERS",
      );
      const adopted = await edit({ ...adoption, modelBody: "cube(width);" });
      assert.equal(adopted.parameters[0].value, 20);
    } finally {
      await Promise.allSettled([client.close(), server.close()]);
      await database?.close();
      await rm(workspaceRoot, { recursive: true, force: true });
    }
  });
