import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
export function createHostedToolCaller(
  origin: string,
  request: typeof fetch,
): (
  name: string,
  input: Record<string, unknown>,
  signal: AbortSignal,
) => Promise<CallToolResult> {
  return async (name, input, signal): Promise<CallToolResult> => {
    signal.throwIfAborted();
    const client = new Client({
      name: "theoryfoundry-local-worker",
      version: "0.1.0",
    });
    const transport = new StreamableHTTPClientTransport(
      new URL("/mcp", origin),
      {
        fetch: (url, init): Promise<Response> =>
          request(url, {
            ...init,
            signal: AbortSignal.any([
              signal,
              ...(init?.signal ? [init.signal] : []),
            ]),
          }),
      },
    );
    try {
      await client.connect(transport as Transport, { signal, timeout: 15_000 });
      return (await client.callTool({ name, arguments: input }, undefined, {
        signal,
        timeout: 90_000,
      })) as CallToolResult;
    } finally {
      await client.close().catch(() => undefined);
    }
  };
}
