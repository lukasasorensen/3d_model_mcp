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

test("a connected model creates, validates, promotes, revises and exports through hosted CAD tools", async () => {
  let revision = null;
  let source = "";
  let candidate;
  const calls = [];
  const client = exactClient(async (name, input) => {
    calls.push(name);
    assert.equal(input.projectId, request.projectId);
    let structuredContent;
    if (name === "get_project_state")
      structuredContent = {
        state: {
          projectId: request.projectId,
          currentRevision: revision,
          source: null,
          artifacts: [],
          diagnostics: [],
        },
      };
    if (name === "read_model_source") {
      assert.equal(input.revision, revision);
      structuredContent = {
        model: { revision, source, sourceHash: "a".repeat(64) },
      };
    }
    if (name === "propose_model_source") {
      assert.equal(input.parentRevision, revision);
      candidate = {
        candidateId: revision ? "candidate-2" : "candidate-1",
        state: "CREATED",
        parent: revision,
        source: input.source,
      };
      structuredContent = { candidate };
    }
    if (name === "validate_and_render") {
      assert.equal(input.candidateId, candidate.candidateId);
      candidate.state = "VALID";
      structuredContent = { candidate };
    }
    if (name === "promote_candidate") {
      assert.equal(candidate.state, "VALID");
      assert.equal(input.expectedParentRevision, revision);
      source = candidate.source;
      revision = revision ? "revision-2" : "revision-1";
      structuredContent = {
        revision: {
          revisionId: revision,
          candidateId: candidate.candidateId,
          artifacts: [],
        },
      };
    }
    if (name === "export_model") {
      assert.equal(input.revision, "revision-2");
      structuredContent = {
        export: {
          exportId: "export-1",
          projectId: request.projectId,
          revision,
          sourceHash: "a".repeat(64),
          format: "stl",
          mimeType: "model/stl",
          filename: "model.stl",
          hash: "b".repeat(64),
          byteSize: 100,
          expiresAt: "2030-01-01T00:00:00.000Z",
          downloadUrl: "https://example.test/export?token=fixture",
          downloadExpiresAt: "2030-01-01T00:00:00.000Z",
        },
      };
    }
    assert.ok(structuredContent, name);
    return { isError: false, structuredContent };
  });
  for (const turn of [1, 2]) {
    let invocation = 0;
    const candidateId = `candidate-${turn}`;
    const steps = [
      [
        "propose_model_source",
        {
          projectId: "untrusted-project",
          parentRevision: revision,
          source: `cube([${turn * 10},20,30]);`,
        },
      ],
      [
        "validate_and_render",
        {
          projectId: "untrusted-project",
          candidateId,
          previewProfile: "standard",
        },
      ],
      [
        "promote_candidate",
        {
          projectId: "untrusted-project",
          candidateId,
          expectedParentRevision: revision,
        },
      ],
      ...(turn === 2
        ? [
            [
              "export_model",
              {
                projectId: "untrusted-project",
                revision: "revision-2",
                format: "stl",
              },
            ],
          ]
        : []),
    ];
    const provider = createConnectionProvider({
      provider: "ollama",
      model: "fixture",
      invoke: async (input) => {
        if (turn === 2) {
          assert.ok(input.messages[0].content.includes("cube([10,20,30]);"));
          assert.ok(input.messages[0].content.includes("revision-1"));
        }
        const step = steps[invocation++];
        return step
          ? {
              content: "",
              toolCalls: [
                {
                  id: `turn-${turn}-call-${invocation}`,
                  name: step[0],
                  args: step[1],
                },
              ],
            }
          : { content: "Saved.", toolCalls: [] };
      },
    });
    const events = await collect(streamCadChat(request, { client, provider }));
    assert.equal(events.at(-1).outcome, "completed", JSON.stringify(events));
    assert.ok(
      events.some(
        (event) =>
          event.type === "revision" && event.status === "candidate_promoted",
      ),
    );
    if (turn === 2)
      assert.ok(events.some((event) => event.type === "export_ready"));
  }
  assert.equal(revision, "revision-2");
  assert.deepEqual(
    calls.filter(
      (name) => name !== "get_project_state" && name !== "read_model_source",
    ),
    [
      "propose_model_source",
      "validate_and_render",
      "promote_candidate",
      "propose_model_source",
      "validate_and_render",
      "promote_candidate",
      "export_model",
    ],
  );
});
test("unauthorized project context fails before sending data to a model", async () => {
  let invoked = false;
  const provider = createConnectionProvider({
    provider: "ollama",
    model: "fixture",
    invoke: async () => {
      invoked = true;
      throw new Error();
    },
  });
  const events = await collect(
    streamCadChat(request, {
      provider,
      client: exactClient(async () => ({
        isError: true,
        error: { code: "PROJECT_NOT_FOUND" },
      })),
    }),
  );
  assert.equal(invoked, false);
  assert.equal(events.at(-1).outcome, "failed");
});

test("native provider authentication errors survive the agent stream without exposing tokens", async () => {
  const token = "sensitive-fixture-token";
  const provider = createConnectionProvider({
    provider: "openai",
    model: "fixture",
    token,
    fetch: async () =>
      Response.json({ error: { message: token } }, { status: 401 }),
  });
  const events = await collect(
    streamCadChat(request, {
      provider,
      client: exactClient(async () => ({
        isError: false,
        structuredContent: { state: { currentRevision: null } },
      })),
    }),
  );
  assert.ok(
    events.some(
      (event) => event.type === "error" && event.code === "AI_AUTHENTICATION",
    ),
    JSON.stringify(events),
  );
  assert.ok(!JSON.stringify(events).includes(token));
});
