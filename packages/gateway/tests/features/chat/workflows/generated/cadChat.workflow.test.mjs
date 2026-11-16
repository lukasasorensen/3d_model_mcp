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

const modelBody = "cube([width, 10, 5]);";
const parameter = {
  id: "width",
  binding: "width",
  type: "number",
  label: "Width",
  defaultValue: 10,
  value: 20,
};

function contextClient(callTool) {
  return exactClient(async (name, input) => {
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
            parameters: [parameter],
          },
        },
      };
    if (name === "read_model_source") {
      assert.equal(input.revision, "revision-1");
      return {
        isError: false,
        structuredContent: {
          model: {
            revision: "revision-1",
            modelBody,
            parameters: [parameter],
            sourceHash: "a".repeat(64),
          },
        },
      };
    }
    return callTool(name, input);
  });
}

for (const editTool of ["propose_model_source", "edit_parameters"])
  test(`live connected chat accepts a JSON-only value change through ${editTool}`, async () => {
    const calls = [];
    const updated = { ...parameter, value: 30 };
    const steps = [
      ...(editTool === "edit_parameters"
        ? [["list_model_parameters", { projectId: request.projectId }]]
        : []),
      [
        editTool,
        {
          projectId: request.projectId,
          parentRevision: "revision-1",
          ...(editTool === "edit_parameters"
            ? { operations: [{ op: "set_value", id: "width", value: 30 }] }
            : { modelBody, parameters: [updated] }),
        },
      ],
      [
        "validate_and_render",
        {
          projectId: request.projectId,
          candidateId: "candidate-2",
          previewProfile: "standard",
        },
      ],
      [
        "promote_candidate",
        {
          projectId: request.projectId,
          candidateId: "candidate-2",
          expectedParentRevision: "revision-1",
        },
      ],
    ];
    let invocation = 0;
    const provider = createConnectionProvider({
      provider: "ollama",
      model: "fixture",
      invoke: async (input) => {
        const context = input.messages[0].content;
        assert.ok(
          context.includes(
            JSON.stringify({
              revision: "revision-1",
              modelBody,
              parameters: [parameter],
              sourceHash: "a".repeat(64),
            }),
          ),
        );
        const step = steps[invocation++];
        return step
          ? {
              content: "",
              toolCalls: [
                { id: `generated-${invocation}`, name: step[0], args: step[1] },
              ],
            }
          : { content: `Saved. ${modelBody}`, toolCalls: [] };
      },
    });
    const client = contextClient(async (name, input) => {
      calls.push(name);
      if (name === "list_model_parameters")
        return {
          isError: false,
          structuredContent: {
            revision: "revision-1",
            parameters: [parameter],
          },
        };
      if (name === editTool) {
        assert.equal(
          input.modelBody,
          editTool === "edit_parameters" ? undefined : modelBody,
        );
        assert.ok(input.requestId);
        assert.ok(input.toolCallId.startsWith(input.requestId));
        assert.equal(input.source, undefined);
        assert.equal(input.parentRevision, "revision-1");
        if (editTool === "edit_parameters")
          assert.deepEqual(input.operations, [
            { op: "set_value", id: "width", value: 30 },
          ]);
        else assert.deepEqual(input.parameters, [updated]);
        return {
          isError: false,
          structuredContent: {
            candidate: {
              candidateId: "candidate-2",
              state: "CREATED",
              parentRevision: "revision-1",
              parameters: [updated],
            },
          },
        };
      }
      if (name === "validate_and_render")
        return {
          isError: false,
          structuredContent: {
            candidate: {
              candidateId: "candidate-2",
              state: "VALID",
              parameters: [updated],
            },
          },
        };
      if (name === "promote_candidate")
        return {
          isError: false,
          structuredContent: {
            revision: {
              revisionId: "revision-2",
              candidateId: "candidate-2",
              parentRevision: "revision-1",
              parameters: [updated],
              artifacts: [],
            },
          },
        };
      throw new Error(`Unexpected tool ${name}`);
    });
    const events = await collect(streamCadChat(request, { client, provider }));
    assert.equal(events.at(-1).outcome, "completed", JSON.stringify(events));
    assert.deepEqual(
      calls,
      steps.map(([name]) => name),
    );
    assert.ok(
      events.some(
        (event) =>
          event.type === "revision" &&
          event.status === "candidate_promoted" &&
          event.revisionId === "revision-2",
      ),
    );
    assert.ok(
      !events
        .filter((event) => event.type === "assistant_delta")
        .map((event) => event.delta)
        .join("")
        .includes(modelBody),
    );
  });

test("generated source read bodies retain the existing assistant-text redaction policy", async () => {
  let called = false;
  const provider = createConnectionProvider({
    provider: "ollama",
    model: "fixture",
    invoke: async () => {
      called = true;
      return { content: `The current body is ${modelBody}`, toolCalls: [] };
    },
  });
  const events = await collect(
    streamCadChat(request, {
      client: contextClient(async () => {
        throw new Error("Unexpected mutation");
      }),
      provider,
    }),
  );
  assert.equal(called, true);
  assert.equal(events.at(-1).outcome, "completed", JSON.stringify(events));
  const text = events
    .filter((event) => event.type === "assistant_delta")
    .map((event) => event.delta)
    .join("");
  assert.ok(text.includes("[redacted]"), text);
  assert.ok(!text.includes(modelBody));
});
