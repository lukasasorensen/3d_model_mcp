import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { CAD_TOOL_NAMES } from "@rjls/gateway";
import { awaitMcpOperation } from "./abortable-mcp-request.js";
import { CAD_LIMITS } from "@rjls/contracts";
import { authenticateRemoteMcp, McpAuthenticationError, mcpAuthChallenge } from "./remote-mcp-auth.js";
import { remoteMcpEnabled, remoteMcpIdentity, REMOTE_MCP_TIMEOUT_MS } from "./remote-mcp-policy.js";
import { createRemoteCadMcpServer } from "./remote-mcp-runtime.js";
import { recordRemoteMcpEvent } from "./remote-mcp-observability.js";

const MAX_REQUEST_BYTES = CAD_LIMITS.sourceBytes * 6 + 32 * 1024;

async function readMcpBody(request: Request): Promise<unknown> {
  if (Number(request.headers.get("content-length")) > MAX_REQUEST_BYTES) throw new RangeError("request too large");
  const reader = request.body?.getReader();
  if (!reader) throw new SyntaxError("empty request");
  const cancel = () => { void reader.cancel().catch(() => undefined); };
  request.signal.addEventListener("abort", cancel, { once: true });
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      request.signal.throwIfAborted();
      const { done, value } = await reader.read();
      request.signal.throwIfAborted();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_REQUEST_BYTES) { await reader.cancel(); throw new RangeError("request too large"); }
      chunks.push(value);
    }
  } finally { request.signal.removeEventListener("abort", cancel); reader.releaseLock(); }
  const body: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new SyntaxError("one MCP message is required");
  return body;
}

export function createRemoteMcpHandler(dependencies = {
  authenticate: authenticateRemoteMcp, createServer: createRemoteCadMcpServer,
}, timeoutMs = REMOTE_MCP_TIMEOUT_MS) {
  return async function POST(request: Request): Promise<Response> {
    if (!remoteMcpEnabled()) return new Response(null, { status: 404 });
    const origin = request.headers.get("origin");
    if (origin !== null && origin !== remoteMcpIdentity().origin) return Response.json({ error: "ORIGIN_DENIED" }, { status: 403 });
    if (request.method !== "POST") return new Response(null, { status: 405, headers: { allow: "POST" } });
    const abort = new AbortController();
    const signal = AbortSignal.any([request.signal, abort.signal]);
    const timer = setTimeout(() => abort.abort(), timeoutMs);
    let ownerId: string;
    try { ownerId = await awaitMcpOperation(dependencies.authenticate(request), signal); recordRemoteMcpEvent("authentication", "accepted"); }
    catch (error) {
      clearTimeout(timer);
      recordRemoteMcpEvent("authentication", error instanceof McpAuthenticationError ? "denied" : "unavailable");
      return error instanceof McpAuthenticationError ? mcpAuthChallenge(error) : Response.json({ error: "AUTHENTICATION_UNAVAILABLE" }, { status: 503 });
    }
    const started = performance.now();
    let server: Awaited<ReturnType<typeof createRemoteCadMcpServer>> | undefined;
    let transport: WebStandardStreamableHTTPServerTransport | undefined;
    let toolName: string | undefined;
    try {
      const parsedBody = await readMcpBody(new Request(request, { signal }));
      const message = parsedBody as { method?: unknown; params?: { name?: unknown } };
      if (message.method === "tools/call" && typeof message.params?.name === "string" && CAD_TOOL_NAMES.some((name) => name === message.params?.name)) toolName = message.params.name;
      const createdServer = await awaitMcpOperation(dependencies.createServer(ownerId, signal).then(async (created) => {
        if (signal.aborted) { await created.close(); signal.throwIfAborted(); }
        return created;
      }), signal);
      server = createdServer;
      transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
      await createdServer.connect(transport);
      const response = await awaitMcpOperation(transport.handleRequest(request, { parsedBody }), signal);
      response.headers.set("cache-control", "no-store");
      recordRemoteMcpEvent("request", response.ok ? "success" : "rejected", performance.now() - started, toolName);
      return response;
    } catch (error) {
      recordRemoteMcpEvent("request", signal.aborted ? "cancelled" : "failed", performance.now() - started);
      const status = signal.aborted ? 504 : error instanceof RangeError ? 413 : error instanceof SyntaxError ? 400 : 503;
      return Response.json({ error: status === 400 ? "INVALID_REQUEST" : status === 413 ? "REQUEST_TOO_LARGE" : status === 504 ? "REQUEST_TIMEOUT" : "MCP_UNAVAILABLE" }, { status });
    } finally {
      clearTimeout(timer); abort.abort();
      const closed = await Promise.allSettled([server?.close(), transport?.close()]);
      if (closed.some((result) => result.status === "rejected")) recordRemoteMcpEvent("request", "cleanup-failed");
    }
  };
}

export const handleRemoteMcpRequest = createRemoteMcpHandler();
