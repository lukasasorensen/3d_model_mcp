import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createCadMcpServer } from "@theoryfoundry/mcp";
import { ModelProjectRepository } from "@theoryfoundry/model-project";
import {
  createConnectionProvider,
  streamCadChat,
} from "@theoryfoundry/gateway";
import { connectedClient } from "../../../dist/features/mcp/services/connectedClient.service.js";
import { renderer } from "../../../model-project/tests/fixtures/fileProject.fixture.mjs";

test("sidebar AI receives real MCP parameter diagnostics and repairs the edit before promotion", async () => {
  const workspaceRoot = await mkdtemp(join(tmpdir(), "parameter-feedback-"));
  const repository = new ModelProjectRepository({
    workspaceRoot,
    renderer,
    acceptRendererProvenance: () => true,
  });
  const server = createCadMcpServer(repository);
  const client = new Client({ name: "parameter-feedback-test", version: "1" });
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  try {
    const { projectId } = await repository.createProject({
      name: "Repair parameter",
      description: "Real error feedback",
    });
    const modelBody = "cube([width, 10, 5]);";
    const candidate = await repository.proposeModelSource({
      projectId,
      parentRevision: null,
      modelBody,
      parameters: [
        {
          id: "width",
          binding: "width",
          label: "Width",
          type: "number",
          value: 20,
          defaultValue: 10,
          min: 1,
        },
      ],
      requestId: "initial",
      toolCallId: "initial",
    });
    await repository.validateAndRender({
      projectId,
      candidateId: candidate.candidateId,
      previewProfile: "standard",
    });
    const first = await repository.promoteCandidate({
      projectId,
      candidateId: candidate.candidateId,
      expectedParentRevision: null,
    });
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    let step = 0;
    let repairedCandidate;
    const provider = createConnectionProvider({
      provider: "ollama",
      model: "repair-fixture",
      invoke: async (input) => {
        const feedback = input.messages
          .filter((message) => message.role === "tool")
          .at(-1)?.content;
        const call = (name, args) => ({
          content: "",
          toolCalls: [
            { id: `provider-${step}`, name, args: { projectId, ...args } },
          ],
        });
        switch (step++) {
          case 0:
            return call("edit_parameters", {
              parentRevision: first.revisionId,
              operations: [{ op: "set_value", id: "width", value: 0 }],
            });
          case 1: {
            assert.deepEqual(JSON.parse(feedback), {
              error: {
                code: "INVALID_PARAMETERS",
                message: "Value is below minimum.",
                details: { path: "parameters.width.value" },
              },
            });
            assert.equal(
              (await repository.getProjectState(projectId)).currentRevision,
              first.revisionId,
            );
            return call("edit_parameters", {
              parentRevision: first.revisionId,
              operations: [{ op: "set_value", id: "width", value: 30 }],
            });
          }
          case 2:
            repairedCandidate = JSON.parse(feedback).candidate.candidateId;
            return call("validate_and_render", {
              candidateId: repairedCandidate,
              previewProfile: "standard",
            });
          case 3:
            assert.equal(JSON.parse(feedback).candidate.state, "VALID");
            return call("promote_candidate", {
              candidateId: repairedCandidate,
              expectedParentRevision: first.revisionId,
            });
          default:
            assert.equal(JSON.parse(feedback).revision.parameters[0].value, 30);
            return { content: "Updated width.", toolCalls: [] };
        }
      },
    });
    const events = [];
    for await (const event of streamCadChat(
      {
        version: "3",
        projectId,
        sessionId: "repair-session",
        message: "Change width",
      },
      { client: connectedClient(client, async () => {}), provider },
    ))
      events.push(event);
    assert.equal(events.at(-1).outcome, "completed", JSON.stringify(events));
    assert.equal(step, 5);
    const accepted = await repository.readModelSource(projectId);
    assert.equal(accepted.modelBody, modelBody);
    assert.equal(accepted.parameters[0].value, 30);
    const publicErrors = events.filter((event) => event.type === "error");
    assert.equal(publicErrors.length, 1);
    assert.equal(
      publicErrors[0].message,
      "The CAD tool rejected the request safely.",
    );
    assert.ok(!JSON.stringify(publicErrors).includes("parameters.width"));
  } finally {
    await Promise.allSettled([client.close(), server.close()]);
    await rm(workspaceRoot, { recursive: true, force: true });
  }
});
