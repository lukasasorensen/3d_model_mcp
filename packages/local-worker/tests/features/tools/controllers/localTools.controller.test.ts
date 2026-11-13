import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import {
  CAD_LIMITS,
  PREVIEW_LIMITS,
  parameterSnapshotSchema,
  type ModelSourceDocument,
} from "@theoryfoundry/contracts";
import { registerLocalTools } from "../../../../src/features/tools/controllers/localTools.controller.js";

async function callToolWithResult(
  result: CallToolResult,
  name = "read_model_source",
): Promise<CallToolResult> {
  const server = new McpServer({ name: "budget-fixture", version: "1" });
  const client = new Client({ name: "budget-test", version: "1" });
  registerLocalTools(
    server,
    {
      callHosted: async () => result,
      compute: async () => result,
      availability: () => "ready",
    },
    new AbortController().signal,
  );
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  try {
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    return (await client.callTool({
      name,
      arguments: { projectId: "project" },
    })) as CallToolResult;
  } finally {
    await Promise.allSettled([client.close(), server.close()]);
  }
}

function sourceDocument(padding: string): ModelSourceDocument {
  const parameters = parameterSnapshotSchema.parse(
    Array.from({ length: 50 }, (_, index) => ({
      id: `p${index}`,
      binding: `p${index}`,
      label: `Parameter ${index}`,
      description: "x".repeat(2000),
      type: "number",
      defaultValue: 20,
      value: 20,
    })),
  );
  const header = `// theoryfoundry:parameters:start v1\n${parameters.map((p) => `${p.binding}=20;`).join("\n")}\n// theoryfoundry:parameters:end\ncube(p0);\n/*`;
  const source = header + padding.repeat(180 * 1024 - header.length - 2) + "*/";
  assert.ok(Buffer.byteLength(source) <= CAD_LIMITS.sourceBytes);
  return {
    revision: "revision",
    source,
    sourceHash: createHash("sha256").update(source).digest("hex"),
    parameters,
  };
}

void test("parameterized source reads budget the payload separately from duplicated and escaped MCP text", async () => {
  for (const padding of ["x", "\t"])
    for (const structured of [true, false]) {
      const value = { model: sourceDocument(padding) };
      const result: CallToolResult = {
        content: [{ type: "text", text: JSON.stringify(value) }],
        ...(structured ? { structuredContent: value } : {}),
      };
      assert.ok(
        Buffer.byteLength(JSON.stringify(value)) < CAD_LIMITS.toolResultBytes,
      );
      if (structured || padding === "\t")
        assert.ok(
          Buffer.byteLength(JSON.stringify(result)) >
            CAD_LIMITS.toolResultBytes,
        );
      const actual = await callToolWithResult(result);
      assert.equal(actual.isError, undefined, JSON.stringify(actual.content));
      assert.deepEqual(actual.structuredContent, value);
      assert.deepEqual(actual.content, result.content);
    }
});

void test("source payloads above the logical limit are rejected with or without structured content", async () => {
  const value = {
    model: {
      revision: "revision",
      source: "x".repeat(CAD_LIMITS.toolResultBytes),
      sourceHash: "1".repeat(64),
    },
  };
  for (const structured of [true, false]) {
    const actual = await callToolWithResult({
      content: [{ type: "text", text: JSON.stringify(value) }],
      ...(structured ? { structuredContent: value } : {}),
    });
    assert.equal(actual.isError, true);
    assert.match(JSON.stringify(actual.content), /RESULT_TOO_LARGE/);
  }
});

void test("a small structured payload cannot bypass the independent MCP envelope limit", async () => {
  const actual = await callToolWithResult({
    content: [{ type: "text", text: "x".repeat(2 * 1024 * 1024) }],
    structuredContent: {
      model: {
        revision: "revision",
        source: "cube(1);",
        sourceHash: "1".repeat(64),
      },
    },
  });
  assert.equal(actual.isError, true);
  assert.match(JSON.stringify(actual.content), /RESULT_TOO_LARGE/);
});

void test("hosted error responses retain their original logical byte limit", async () => {
  const actual = await callToolWithResult({
    isError: true,
    content: [{ type: "text", text: "x".repeat(CAD_LIMITS.toolResultBytes) }],
  });
  assert.equal(actual.isError, true);
  assert.match(JSON.stringify(actual.content), /RESULT_TOO_LARGE/);
});

void test("preview images keep their separate full-envelope byte limit", async () => {
  const metadata = {
    projectId: "project",
    revisionId: "revision",
    sourceHash: "1".repeat(64),
    imageHash: "2".repeat(64),
    view: "isometric",
    width: 768,
    height: 768,
  };
  for (const bytes of [
    CAD_LIMITS.toolResultBytes * 2,
    PREVIEW_LIMITS.payloadBytes,
  ]) {
    const result: CallToolResult = {
      content: [
        { type: "text", text: JSON.stringify(metadata) },
        { type: "image", mimeType: "image/png", data: "A".repeat(bytes) },
      ],
      structuredContent: metadata,
    };
    const actual = await callToolWithResult(result, "get_model_preview");
    if (bytes < PREVIEW_LIMITS.payloadBytes) {
      assert.equal(actual.isError, undefined);
      assert.deepEqual(actual.content, result.content);
    } else {
      assert.equal(actual.isError, true);
      assert.match(JSON.stringify(actual.content), /RESULT_TOO_LARGE/);
    }
  }
});
