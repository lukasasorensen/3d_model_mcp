import { FakeToolCallingModel } from "langchain";
import assert from "node:assert/strict";
import test from "node:test";
import { streamCadChat } from "../../../../../dist/index.js";
import {
  collect,
  exactClient,
  request,
} from "../../../../fixtures/chat.fixture.mjs";
test("emits causal observability from the real agent and public MCP results", async () => {
  const records = [];
  const metrics = [];
  const client = exactClient(async (name) =>
    name === "validate_and_render"
      ? {
          isError: false,
          structuredContent: {
            candidate: { candidateId: "candidate-1", state: "VALID" },
          },
        }
      : {
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
        },
  );
  await collect(
    streamCadChat(request, {
      client,
      createId: () => "request-observed",
      createObservabilitySink: () => ({
        record: (event) => records.push(event),
        metric: (sample) => metrics.push(sample),
      }),
    }),
  );
  assert.equal(
    records.filter((record) => record.event === "agent.turn").length,
    1,
  );
  assert.ok(
    records.some(
      (record) =>
        record.event === "chat.tool_start" &&
        record.toolCallId === "request-observed-t1",
    ),
  );
  assert.ok(
    records.some(
      (record) => record.event === "chat.done" && record.outcome === "success",
    ),
  );
  assert.ok(
    records.every(
      (record) =>
        record.requestId === "request-observed" &&
        record.conversationId === request.sessionId,
    ),
  );
  assert.doesNotMatch(JSON.stringify(records), new RegExp(request.message));
  assert.ok(
    metrics.some(
      (sample) =>
        sample.name === "request_count" && sample.labels.outcome === "success",
    ),
  );
  assert.ok(
    metrics.some(
      (sample) => sample.name === "tool_rounds" && sample.value === 1,
    ),
  );
  assert.ok(
    metrics.every((sample) =>
      Object.keys(sample.labels).every((key) =>
        ["service", "operation", "outcome", "diagnosticCode"].includes(key),
      ),
    ),
  );
});

test("emits invalid-candidate, promotion-conflict, render, and recovery metrics from MCP outcomes", async () => {
  const provider = {
    id: "observability-outcomes",
    createModel() {
      return new FakeToolCallingModel({
        toolCalls: [
          [
            {
              id: "validate-call",
              name: "validate_and_render",
              args: {
                projectId: "project-1",
                candidateId: "candidate-bad",
                previewProfile: "standard",
              },
            },
          ],
          [
            {
              id: "promote-call",
              name: "promote_candidate",
              args: {
                projectId: "project-1",
                candidateId: "candidate-stale",
                expectedParentRevision: null,
              },
            },
          ],
          [
            {
              id: "restore-call",
              name: "restore_revision",
              args: { projectId: "project-1", revision: "revision-old" },
            },
          ],
          [],
        ],
      });
    },
  };
  const client = exactClient(async (name) => {
    if (name === "validate_and_render")
      return {
        isError: false,
        structuredContent: {
          candidate: {
            candidateId: "candidate-bad",
            state: "REJECTED",
            artifacts: [],
          },
        },
      };
    if (name === "promote_candidate")
      return {
        isError: true,
        error: { code: "STALE_REVISION", message: "stale" },
      };
    return {
      isError: false,
      structuredContent: {
        revision: {
          revisionId: "revision-restored",
          candidateId: "candidate-restored",
          artifacts: [],
        },
      },
    };
  });
  const metrics = [];
  await collect(
    streamCadChat(request, {
      client,
      provider,
      createId: () => "request-metrics",
      createObservabilitySink: () => ({
        record() {},
        metric: (sample) => metrics.push(sample),
      }),
    }),
  );
  assert.ok(
    metrics.some(
      (sample) =>
        sample.name === "render_duration_ms" &&
        sample.labels.outcome === "failure",
    ),
    JSON.stringify(metrics),
  );
  assert.ok(
    metrics.some((sample) => sample.name === "invalid_candidate_count"),
  );
  assert.ok(
    metrics.some((sample) => sample.name === "promotion_conflict_count"),
  );
  assert.ok(metrics.some((sample) => sample.name === "recovery_action_count"));
});
