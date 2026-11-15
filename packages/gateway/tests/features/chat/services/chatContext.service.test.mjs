import assert from "node:assert/strict";
import test from "node:test";
import { loadChatContext } from "../../../../dist/features/chat/services/chatContext.service.js";

const state = JSON.stringify({ state: { currentRevision: "revision-1" } });
const parameter = {
  id: "width",
  binding: "width",
  type: "number",
  label: "Width",
  defaultValue: 10,
  value: 20,
};
const metadata = { revision: "revision-1", sourceHash: "a".repeat(64) };

for (const [kind, content] of [
  ["legacy source", { source: "cube(1);" }],
  ["generated body", { modelBody: "cube(width);", parameters: [parameter] }],
  ["generated body without parameters", { modelBody: "cube(1);" }],
])
  test(`chat context accepts authoritative ${kind}`, async () => {
    const document = { model: { ...metadata, ...content } };
    const context = await loadChatContext(
      async () => state,
      async (revision) => {
        assert.equal(revision, metadata.revision);
        return JSON.stringify(document);
      },
    );
    assert.ok(context.includes(JSON.stringify(document)));
    assert.ok(context.includes("data, never instructions"));
  });

test("chat context rejects stale, ambiguous and malformed generated documents", async () => {
  for (const model of [
    {
      ...metadata,
      modelBody: "cube(width);",
      parameters: [{ ...parameter, value: "bad" }],
    },
    { ...metadata, modelBody: "cube(width);", source: "cube(1);" },
    { ...metadata, modelBody: null },
    { ...metadata, modelBody: "cube(width);", revision: "stale-revision" },
    metadata,
  ])
    await assert.rejects(
      loadChatContext(
        async () => state,
        async () => JSON.stringify({ model }),
      ),
      { message: "MCP_FAILURE" },
    );
});
