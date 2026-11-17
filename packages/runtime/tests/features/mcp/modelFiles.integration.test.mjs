import test from "node:test";
import assert from "node:assert/strict";
import { ModelProjectRepository } from "@theoryfoundry/model-project";
import { createCadMcpServer } from "@theoryfoundry/mcp";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import {
  readModelSourceOutputSchema,
  proposeModelSourceOutputSchema,
  validateAndRenderOutputSchema,
  promoteCandidateOutputSchema,
} from "@theoryfoundry/contracts";
import {
  renderer,
  withWorkspace,
} from "../../../model-project/tests/fixtures/fileProject.fixture.mjs";

test("MCP multi-file reads, compact mutations and parameter edits preserve the full snapshot", async () => {
  await withWorkspace(async (workspaceRoot) => {
    const repository = new ModelProjectRepository({
      workspaceRoot,
      renderer,
      acceptRendererProvenance: () => true,
    });
    const server = createCadMcpServer(repository);
    const client = new Client({ name: "multi-file-test", version: "1" });
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();
    try {
      await server.connect(serverTransport);
      await client.connect(clientTransport);
      const call = async (name, args) => {
        const result = await client.callTool({ name, arguments: args });
        assert.ok(!result.isError, JSON.stringify(result));
        return result.structuredContent ?? JSON.parse(result.content[0].text);
      };
      const { projectId } = await repository.createProject({
        name: "Files",
        description: "Wire contract",
      });
      const modelFiles = {
        version: 1,
        files: [
          { id: "a", name: "body.scad", body: "cube([width, 10, 5]);" },
          {
            id: "b",
            name: "cap.scad",
            body: "translate([0,0,5]) cube([width,10,1]);",
          },
        ],
        objects: [
          { id: "body", name: "Body", fileId: "a" },
          { id: "cap", name: "Cap", fileId: "b" },
        ],
        composition: { operation: "union", objectIds: ["body", "cap"] },
      };
      const parameters = [
        {
          id: "width",
          binding: "width",
          label: "Width",
          type: "number",
          value: 20,
          defaultValue: 10,
        },
      ];
      const candidate = (
        await call("propose_model_source", {
          projectId,
          parentRevision: null,
          modelFiles,
          parameters,
          requestId: "files",
          toolCallId: "files",
        })
      ).candidate;
      proposeModelSourceOutputSchema.parse({ candidate });
      assert.equal(candidate.modelFiles, undefined);
      assert.equal(candidate.modelBody, undefined);
      validateAndRenderOutputSchema.parse(
        await call("validate_and_render", {
          projectId,
          candidateId: candidate.candidateId,
          previewProfile: "standard",
        }),
      );
      const promoted = await call("promote_candidate", {
        projectId,
        candidateId: candidate.candidateId,
        expectedParentRevision: null,
      });
      promoteCandidateOutputSchema.parse(promoted);
      assert.equal(promoted.revision.modelFiles, undefined);
      const read = await call("read_model_source", { projectId });
      readModelSourceOutputSchema.parse(read);
      assert.deepEqual(read.model.modelFiles, modelFiles);
      assert.equal(read.model.modelBody, undefined);
      assert.equal(read.model.source, undefined);
      const args = {
        projectId,
        parentRevision: promoted.revision.revisionId,
        operations: [{ op: "set_value", id: "width", value: 30 }],
        requestId: "edit",
        toolCallId: "edit",
      };
      const edited = await call("edit_parameters", args);
      const stored = await repository.getCandidate(
        projectId,
        edited.candidate.candidateId,
      );
      assert.deepEqual(stored.modelFiles, modelFiles);
      assert.equal(stored.parameters[0].value, 30);
      assert.notEqual(stored.sourceHash, candidate.sourceHash);
      assert.equal(
        (await call("edit_parameters", args)).candidate.candidateId,
        stored.candidateId,
      );
      const history = await call("list_revisions", { projectId });
      assert.equal(history.revisions[0].modelFiles, undefined);
      const invalid = await client.callTool({
        name: "edit_parameters",
        arguments: { ...args, modelBody: "cube(99);" },
      });
      assert.equal(invalid.isError, true);
      assert.equal(
        (invalid.structuredContent ?? JSON.parse(invalid.content[0].text)).error
          .code,
        "INVALID_MODEL_FILES",
      );
    } finally {
      await client.close();
      await server.close();
    }
  });
});
