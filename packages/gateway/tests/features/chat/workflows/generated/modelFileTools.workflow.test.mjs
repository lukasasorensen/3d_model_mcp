import assert from "node:assert/strict";
import test from "node:test";
import {
  createConnectionProvider,
  streamCadChat,
} from "../../../../../dist/index.js";
import {
  collect,
  exactClient,
  request,
} from "../../../../fixtures/chat.fixture.mjs";

test("connected chat exposes all file tools, scopes edits and redacts individual file bodies", async () => {
  const body = "cube([17,23,31]);";
  const calls = [];
  let invocation = 0;
  const client = exactClient(async (name, input) => {
    if (name === "get_project_state")
      return {
        isError: false,
        structuredContent: {
          state: {
            projectId: request.projectId,
            currentRevision: "revision-1",
            source: null,
            artifacts: [],
            diagnostics: [],
          },
        },
      };
    if (name === "read_model_source")
      return {
        isError: false,
        structuredContent: {
          model: {
            revision: "revision-1",
            source: "cube(1);",
            sourceHash: "a".repeat(64),
          },
        },
      };
    calls.push({ name, input });
    if (name === "read_model_file")
      return {
        isError: false,
        structuredContent: {
          revision: "revision-1",
          file: { id: "a", name: "A", body },
        },
      };
    assert.equal(name, "edit_model_files");
    return {
      isError: false,
      structuredContent: {
        candidate: { candidateId: "candidate-1", state: "CREATED" },
      },
    };
  });
  const provider = createConnectionProvider({
    provider: "ollama",
    model: "fixture",
    invoke: async (input) => {
      for (const name of [
        "list_model_files",
        "list_model_objects",
        "read_model_file",
        "read_model_object",
        "edit_model_files",
      ])
        assert.ok(input.tools.some((tool) => tool.name === name));
      const steps = [
        {
          name: "read_model_file",
          args: { projectId: "untrusted", fileId: "a" },
        },
        {
          name: "edit_model_files",
          args: {
            projectId: "untrusted",
            parentRevision: "revision-1",
            operations: [{ op: "rename_object", id: "a", name: "Base" }],
          },
        },
      ];
      const next = steps[invocation++];
      return next
        ? { content: "", toolCalls: [{ id: `call-${invocation}`, ...next }] }
        : { content: `Prepared ${body}`, toolCalls: [] };
    },
  });
  const events = await collect(
    streamCadChat(request, {
      client,
      provider,
      createId: () => "file-request",
    }),
  );
  assert.equal(events.at(-1).outcome, "completed", JSON.stringify(events));
  assert.deepEqual(
    calls.map((call) => call.name),
    ["read_model_file", "edit_model_files"],
  );
  assert.ok(calls.every((call) => call.input.projectId === request.projectId));
  assert.equal(calls[1].input.requestId, "file-request");
  assert.equal(calls[1].input.toolCallId, "file-request-t4");
  assert.ok(
    !JSON.stringify(
      events.filter((event) => event.type === "assistant_delta"),
    ).includes(body),
  );
});
