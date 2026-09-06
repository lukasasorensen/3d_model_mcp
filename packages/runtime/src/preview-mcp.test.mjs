import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { createCadMcpServer } from "@rjls/mcp";
import { CadDomainError } from "@rjls/model-project";
import { createRemoteMcpHandler } from "../dist/remote-mcp-http.js";
import { pngFixture } from "./test-support/preview-png.mjs";
const png = pngFixture();

async function assertPreview(client) {
  assert.ok((await client.listTools()).tools.some((t) => t.name === "get_model_preview"));
  const response = await client.callTool({ name: "get_model_preview", arguments: { projectId: "project", view: "right" } });
  assert.equal(response.isError, undefined);
  assert.equal(response.content.filter((c) => c.type === "image").length, 1);
  assert.equal(response.content.find((c) => c.type === "image").data, png);
  assert.equal(response.content.find((c) => c.type === "image").mimeType, "image/png");
  assert.equal(response.structuredContent.view, "right");
  assert.deepEqual(JSON.parse(response.content.find((c) => c.type === "text").text), response.structuredContent);
  assert.equal(JSON.stringify(response.structuredContent).includes(png), false);
  const invalid = await client.callTool({ name: "get_model_preview", arguments: { projectId: "project", revisionId: "r", candidateId: "c" } });
  assert.equal(invalid.isError, true);
}

test("native PNG content crosses stdio with no image duplication in structured metadata", async () => {
  const client = new Client({ name: "preview-stdio-test", version: "1" });
  const transport = new StdioClientTransport({ command: process.execPath, args: [fileURLToPath(new URL("./fixtures/stdio-preview-server.mjs", import.meta.url))], stderr: "pipe" });
  try { await client.connect(transport); await assertPreview(client); }
  finally { await client.close(); await transport.close(); }
});

test("native PNG content and guided browser errors cross HTTP MCP", async () => {
  const previous = process.env.RJLS_REMOTE_MCP_ENABLED; process.env.RJLS_REMOTE_MCP_ENABLED = "1";
  let fail = false;
  const handler = createRemoteMcpHandler({ authenticate: async () => "owner", createServer: async (_owner, signal) => createCadMcpServer({}, { signal, previewService: { async getPreview(input) {
    if (fail) throw new CadDomainError("BROWSER_REQUIRED", "Open the project and retry.", { projectUrl: "https://cad.example.com/projects/project" });
    return { metadata: { projectId: input.projectId, revisionId: "revision", sourceHash: "a".repeat(64), imageHash: "b".repeat(64), width: 768, height: 768, view: input.view }, png };
  } } }) });
  const client = new Client({ name: "preview-http-test", version: "1" });
  try {
    await client.connect(new StreamableHTTPClientTransport(new URL("http://localhost:3000/mcp"), { fetch: (url, init) => handler(new Request(url, init)) }));
    await assertPreview(client); fail = true;
    const response = await client.callTool({ name: "get_model_preview", arguments: { projectId: "project" } });
    assert.equal(response.isError, true);
    assert.equal(JSON.parse(response.content[0].text).error.details.projectUrl, "https://cad.example.com/projects/project");
  } finally { await client.close(); if (previous === undefined) delete process.env.RJLS_REMOTE_MCP_ENABLED; else process.env.RJLS_REMOTE_MCP_ENABLED = previous; }
});
