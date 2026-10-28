import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import assert from "node:assert/strict";
import test from "node:test";
import {
  createInMemoryCadMcpClient,
  createStdioCadMcpClient,
} from "../dist/index.js";

test("failed in-memory negotiation closes both peers and preserves the startup error", async (t) => {
  const startupError = new Error("negotiation failed");
  const closed = [];
  t.mock.method(McpServer.prototype, "connect", async () => {});
  t.mock.method(Client.prototype, "connect", async () => {
    throw startupError;
  });
  t.mock.method(Client.prototype, "close", async () => {
    closed.push("client");
    throw new Error("close failed");
  });
  t.mock.method(McpServer.prototype, "close", async () => {
    closed.push("server");
  });
  await assert.rejects(
    createInMemoryCadMcpClient({}),
    (error) => error === startupError,
  );
  assert.deepEqual(closed.sort(), ["client", "server"]);
});

test("failed stdio negotiation closes the transport even when client cleanup fails", async (t) => {
  const startupError = new Error("stdio negotiation failed");
  const closed = [];
  t.mock.method(Client.prototype, "connect", async () => {
    throw startupError;
  });
  t.mock.method(Client.prototype, "close", async () => {
    closed.push("client");
    throw new Error("close failed");
  });
  t.mock.method(StdioClientTransport.prototype, "close", async () => {
    closed.push("transport");
  });
  await assert.rejects(
    createStdioCadMcpClient({ command: process.execPath }),
    (error) => error === startupError,
  );
  assert.deepEqual(closed.sort(), ["client", "transport"]);
});

test("successful stdio clients retain explicit ownership until close", async (t) => {
  const closed = [];
  t.mock.method(Client.prototype, "connect", async () => {});
  t.mock.method(Client.prototype, "close", async () => {
    closed.push("client");
  });
  t.mock.method(StdioClientTransport.prototype, "close", async () => {
    closed.push("transport");
  });
  const client = await createStdioCadMcpClient({ command: process.execPath });
  assert.deepEqual(closed, []);
  await client.close();
  assert.deepEqual(closed.sort(), ["client", "transport"]);
});
