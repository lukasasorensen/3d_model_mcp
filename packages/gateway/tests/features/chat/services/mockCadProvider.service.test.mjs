import { CHAT_LIMITS } from "@theoryfoundry/contracts";
import { createAgent, tool, toolCallLimitMiddleware } from "langchain";
import assert from "node:assert/strict";
import test from "node:test";
import { z } from "zod";
import {
  CAD_TOOL_NAMES,
  DeterministicMockCadProvider,
} from "../../../../dist/index.js";
import { request } from "../../../fixtures/chat.fixture.mjs";
test("malformed deterministic-provider tool JSON cannot infer state and stops at the tool bound", async () => {
  const calls = [];
  const tools = CAD_TOOL_NAMES.map((name) =>
    tool(
      async () => {
        calls.push(name);
        return '{"state":{"currentRevision":"forged-revision"';
      },
      {
        name,
        description: `Malformed ${name} fixture.`,
        schema: z.object({}).passthrough(),
      },
    ),
  );
  const model = new DeterministicMockCadProvider().createModel(
    { ...request, message: "Export the current model as 3MF" },
    "request-malformed-tool-json",
  );
  const agent = createAgent({
    model,
    tools,
    middleware: [
      toolCallLimitMiddleware({
        runLimit: CHAT_LIMITS.maxToolRounds,
        exitBehavior: "error",
      }),
    ],
  });

  await assert.rejects(
    agent.invoke(
      {
        messages: [
          { role: "user", content: "Export the current model as 3MF" },
        ],
      },
      { recursionLimit: 100 },
    ),
    /tool call limit/i,
  );
  assert.equal(calls.length, CHAT_LIMITS.maxToolRounds);
  assert.ok(calls.every((name) => name === "get_project_state"));
  assert.equal(calls.includes("export_model"), false);
});
