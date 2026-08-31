import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { ModelProjectRepository } from "@rjls/model-project";
import { createCadMcpServer } from "@rjls/mcp";
import { createRemoteMcpHandler } from "../dist/remote-mcp-http.js";
import { McpAuthenticationError } from "../dist/remote-mcp-auth.js";
import { validateOAuthCallback, remoteMcpIdentity } from "../dist/remote-mcp-policy.js";

test("native OAuth callbacks and deployment identity reject unsafe input", () => {
  assert.equal(validateOAuthCallback("http://127.0.0.1:4321/callback/abc"), "http://127.0.0.1:4321/callback/abc");
  for (const url of ["http://127.1/callback", "https://example.com/callback", "http://127.0.0.1/*", "http://127.0.0.1/callback?next=evil", "http://user@localhost/callback", "file:///callback"]) assert.throws(() => validateOAuthCallback(url));
  assert.throws(() => remoteMcpIdentity({ NODE_ENV: "production", BETTER_AUTH_URL: "http://localhost:3000" }));
  assert.throws(() => remoteMcpIdentity({ BETTER_AUTH_URL: "https://cad.example.com/" }));
});

test("official MCP client negotiates remote transport, preserves tools, and closes each request", async () => {
  const workspaceRoot = await mkdtemp(join(tmpdir(), "cad-remote-http-"));
  const previous = process.env.RJLS_REMOTE_MCP_ENABLED;
  process.env.RJLS_REMOTE_MCP_ENABLED = "1";
  const repository = new ModelProjectRepository({ workspaceRoot, renderer: { async validateAndRender() { throw new Error("unused"); } } });
  const project = await repository.createProject();
  let created = 0, closed = 0;
  const handler = createRemoteMcpHandler({
    authenticate: async () => "owner-a",
    createServer: async (ownerId, signal) => {
      assert.equal(ownerId, "owner-a");
      const server = createCadMcpServer(repository, { signal });
      const close = server.close.bind(server);
      server.close = async () => { closed++; await close(); };
      created++;
      return server;
    },
  });
  const client = new Client({ name: "remote-test", version: "1.0.0" });
  const transport = new StreamableHTTPClientTransport(new URL("http://localhost:3000/mcp"), { fetch: (url, init) => handler(new Request(url, init)) });
  try {
    await client.connect(transport);
    const listed = await client.listTools();
    assert.deepEqual(listed.tools.map((tool) => tool.name).sort(), ["export_model", "get_project_state", "list_revisions", "promote_candidate", "propose_model_source", "read_model_source", "restore_revision", "validate_and_render"]);
    const result = await client.callTool({ name: "get_project_state", arguments: { projectId: project.projectId } });
    assert.equal(result.structuredContent.state.projectId, project.projectId);
    assert.equal(created, closed);
    const untrusted = await handler(new Request("http://localhost:3000/mcp", { method: "POST", headers: { origin: "https://evil.example" }, body: "{}" }));
    assert.equal(untrusted.status, 403);
    const malformed = await handler(new Request("http://localhost:3000/mcp", { method: "POST", body: "{" }));
    assert.equal(malformed.status, 400);
    const oversized = await handler(new Request("http://localhost:3000/mcp", { method: "POST", body: "x".repeat(2 * 1024 * 1024) }));
    assert.equal(oversized.status, 413);
    const unauthorized = createRemoteMcpHandler({ authenticate: async () => { throw new McpAuthenticationError(401, "invalid_token"); }, createServer: async () => { assert.fail("unauthorized request executed"); } });
    const denied = await unauthorized(new Request("http://localhost:3000/mcp", { method: "POST" }));
    assert.equal(denied.status, 401);
    assert.match(denied.headers.get("www-authenticate"), /resource_metadata/);
    const broken = createRemoteMcpHandler({ authenticate: async () => { throw new Error("database offline"); }, createServer: async () => { assert.fail("broken auth executed"); } });
    assert.equal((await broken(new Request("http://localhost:3000/mcp", { method: "POST" }))).status, 503);
    process.env.RJLS_REMOTE_MCP_ENABLED = "0";
    assert.equal((await handler(new Request("http://localhost:3000/mcp", { method: "POST" }))).status, 404);
  } finally {
    await client.close();
    if (previous === undefined) delete process.env.RJLS_REMOTE_MCP_ENABLED; else process.env.RJLS_REMOTE_MCP_ENABLED = previous;
    await rm(workspaceRoot, { recursive: true, force: true });
  }
});

test("slow uploads and disconnected clients are cancelled before a tool can execute", async () => {
  const previous = process.env.RJLS_REMOTE_MCP_ENABLED;
  process.env.RJLS_REMOTE_MCP_ENABLED = "1";
  let cancelled = false;
  try {
    const handler = createRemoteMcpHandler({ authenticate: async () => "owner", createServer: async () => assert.fail("incomplete upload executed") }, 10);
    const stream = new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode('{"jsonrpc":')); }, cancel() { cancelled = true; } });
    const response = await handler(new Request("http://localhost:3000/mcp", { method: "POST", body: stream, duplex: "half" }));
    assert.equal(response.status, 504);
    assert.equal(cancelled, true);
  } finally {
    if (previous === undefined) delete process.env.RJLS_REMOTE_MCP_ENABLED; else process.env.RJLS_REMOTE_MCP_ENABLED = previous;
  }
});
