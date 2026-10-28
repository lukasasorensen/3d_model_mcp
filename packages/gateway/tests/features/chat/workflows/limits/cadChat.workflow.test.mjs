import { CAD_LIMITS, CHAT_LIMITS } from "@theoryfoundry/contracts";
import { FakeToolCallingModel } from "langchain";
import assert from "node:assert/strict";
import test from "node:test";
import { streamCadChat } from "../../../../../dist/index.js";
import {
  collect,
  exactClient,
  request,
} from "../../../../fixtures/chat.fixture.mjs";
test("allows exactly eight tool calls and blocks the ninth through LangChain middleware", async () => {
  let calls = 0;
  const provider = {
    id: "nine-call-test",
    createModel() {
      return new FakeToolCallingModel({
        toolCalls: [
          ...Array.from({ length: 9 }, (_, index) => [
            {
              id: `provider-${index}`,
              name: "get_project_state",
              args: { projectId: "provider-project" },
            },
          ]),
          [],
        ],
      });
    },
  };
  const client = exactClient(async (_name, input) => {
    calls += 1;
    assert.equal(input.projectId, "project-1");
    return {
      isError: false,
      structuredContent: {
        state: {
          projectId: "project-1",
          currentRevision: null,
          source: null,
          artifacts: [],
          diagnostics: [],
        },
      },
    };
  });
  const events = await collect(
    streamCadChat(request, {
      client,
      provider,
      createId: () => "request-limit",
    }),
  );
  assert.equal(calls, 8);
  assert.ok(
    events.some(
      (event) => event.type === "error" && event.code === "TOOL_LIMIT_EXCEEDED",
    ),
  );
  assert.equal(events.filter((event) => event.type === "done").length, 1);
});

test("injects causal IDs and permits only two repairs in one request lineage", async () => {
  let candidate = 0;
  const inputs = [];
  const client = exactClient(async (name, input) => {
    inputs.push({ name, input });
    if (name === "get_project_state")
      return {
        isError: false,
        structuredContent: {
          state: {
            projectId: "project-1",
            currentRevision: null,
            source: null,
            artifacts: [],
            diagnostics: [],
          },
        },
      };
    if (name === "propose_model_source") {
      candidate += 1;
      return {
        isError: false,
        structuredContent: {
          candidate: {
            candidateId: `candidate-${candidate}`,
            state: "CREATED",
          },
        },
      };
    }
    if (name === "validate_and_render")
      return {
        isError: false,
        structuredContent: {
          candidate: { candidateId: input.candidateId, state: "REJECTED" },
        },
      };
    throw new Error("unexpected tool");
  });
  const events = await collect(
    streamCadChat(
      { ...request, message: "Create a bracket" },
      { client, createId: () => "request-repair" },
    ),
  );
  assert.equal(
    inputs.filter((call) => call.name === "propose_model_source").length,
    3,
  );
  for (const [index, call] of inputs.entries()) {
    assert.equal(call.input.projectId, "project-1");
    if (call.name === "propose_model_source") {
      assert.equal(call.input.requestId, "request-repair");
      assert.equal(call.input.toolCallId, `request-repair-t${index + 1}`);
    }
  }
  assert.equal(
    events.filter(
      (event) =>
        event.type === "revision" && event.status === "candidate_rejected",
    ).length,
    3,
  );
  assert.ok(
    events.some(
      (event) =>
        event.type === "error" && event.code === "REPAIR_LIMIT_EXCEEDED",
    ),
  );
  assert.equal(events.filter((event) => event.type === "done").length, 1);
});

test("atomically blocks parallel fresh-candidate repair bypass before MCP invocation", async () => {
  const proposals = Array.from({ length: 4 }, (_, index) => ({
    id: `parallel-propose-${index}`,
    name: "propose_model_source",
    args: {
      projectId: "provider-project",
      parentRevision: null,
      source: `cube(${index + 1});`,
    },
  }));
  const validations = Array.from({ length: 4 }, (_, index) => ({
    id: `parallel-validate-${index}`,
    name: "validate_and_render",
    args: {
      projectId: "provider-project",
      candidateId: `candidate-${index + 1}`,
      previewProfile: "standard",
    },
  }));
  const provider = {
    id: "parallel-repair-bypass",
    createModel() {
      return new FakeToolCallingModel({
        toolCalls: [proposals, validations, []],
      });
    },
  };
  const invoked = [];
  const client = exactClient(async (name, input) => {
    invoked.push({ name, input });
    if (name === "propose_model_source")
      return {
        isError: false,
        structuredContent: {
          candidate: {
            candidateId: `candidate-${invoked.length}`,
            state: "CREATED",
          },
        },
      };
    return {
      isError: false,
      structuredContent: {
        candidate: { candidateId: input.candidateId, state: "REJECTED" },
      },
    };
  });
  const events = await collect(
    streamCadChat(request, {
      client,
      provider,
      createId: () => "request-parallel-repair",
    }),
  );
  assert.equal(
    invoked.filter((call) => call.name === "propose_model_source").length,
    3,
  );
  assert.equal(
    invoked.filter((call) => call.name === "validate_and_render").length,
    0,
  );
  assert.ok(
    events.some(
      (event) =>
        event.type === "error" && event.code === "REPAIR_LIMIT_EXCEEDED",
    ),
  );
  assert.equal(events.at(-1).outcome, "failed");
});

test("rejects oversized UTF-8 MCP results before model context", async () => {
  const provider = {
    id: "oversized-result",
    createModel() {
      return new FakeToolCallingModel({
        toolCalls: [
          [
            {
              id: "large",
              name: "get_project_state",
              args: { projectId: "provider-project" },
            },
          ],
          [],
        ],
      });
    },
  };
  const canary = "秘密".repeat(600_000);
  assert.ok(
    new TextEncoder().encode(JSON.stringify({ canary })).byteLength >
      2 * 1024 * 1024,
  );
  const events = await collect(
    streamCadChat(request, {
      client: exactClient(async () => ({
        isError: false,
        structuredContent: { canary },
      })),
      provider,
      createId: () => "request-large-result",
    }),
  );
  assert.ok(
    events.some(
      (event) =>
        event.type === "error" && event.code === "TOOL_RESULT_TOO_LARGE",
    ),
  );
  assert.equal(
    events.some(
      (event) =>
        event.type === "assistant_delta" && event.delta.includes("秘密"),
    ),
    false,
  );
  assert.equal(events.at(-1).outcome, "failed");
  assert.equal(CAD_LIMITS.toolResultBytes, 512 * 1024);
});

test("bounds assistant output and deltas by UTF-8 bytes", async () => {
  const provider = {
    id: "multibyte-output",
    createModel() {
      return new FakeToolCallingModel({
        toolCalls: [
          [
            {
              id: "unicode",
              name: "get_project_state",
              args: { projectId: "provider-project" },
            },
          ],
          [],
        ],
      });
    },
  };
  const blob = "😀".repeat(20_000);
  const events = await collect(
    streamCadChat(request, {
      client: exactClient(async () => ({
        isError: false,
        structuredContent: { blob },
      })),
      provider,
      createId: () => "request-unicode",
    }),
  );
  const deltas = events
    .filter((event) => event.type === "assistant_delta")
    .map((event) => event.delta);
  assert.ok(deltas.length > 0);
  assert.ok(
    deltas.every(
      (delta) =>
        new TextEncoder().encode(delta).byteLength <=
        CHAT_LIMITS.assistantDeltaCharacters,
    ),
  );
  assert.ok(
    new TextEncoder().encode(deltas.join("")).byteLength <=
      CHAT_LIMITS.assistantOutputCharacters,
  );
});
