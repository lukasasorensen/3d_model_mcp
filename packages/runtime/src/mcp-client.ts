import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { StdioClientTransport, type StdioServerParameters } from "@modelcontextprotocol/sdk/client/stdio.js";
import type { CadMcpClient, CadMcpToolResult } from "@rjls/gateway";
import { createCadMcpServer, type CadToolName } from "@rjls/mcp";
import type { ModelProjectRepository } from "@rjls/model-project";

export interface ConnectedCadMcpClient extends CadMcpClient {
  readonly processId?: number;
  close(): Promise<void>;
}

function connectedClient(client: Client, close: () => Promise<void>, processId?: number): ConnectedCadMcpClient {
  return {
    ...(processId ? { processId } : {}),
    async listTools(options) {
      const response = await client.listTools(undefined, { signal: options.signal });
      return response.tools.map((definition) => definition.name);
    },
    async callTool(name: CadToolName, input: Record<string, unknown>, options): Promise<CadMcpToolResult> {
      const response = await client.callTool({ name, arguments: input }, undefined, { signal: options.signal });
      const structured = response.structuredContent;
      if (response.isError || !structured || typeof structured !== "object" || Array.isArray(structured)) {
        const content = Array.isArray(response.content) ? response.content : [];
        const firstText = content.find((item): item is { type: "text"; text: string } => typeof item === "object" && item !== null && "type" in item && item.type === "text" && "text" in item && typeof item.text === "string")?.text;
        let error: { code: string; message: string } | undefined;
        try {
          const parsed = JSON.parse(firstText ?? "") as { error?: { code?: unknown; message?: unknown } };
          if (typeof parsed.error?.code === "string" && typeof parsed.error.message === "string") error = { code: parsed.error.code, message: parsed.error.message };
        } catch { /* public gateway applies a fixed safe error */ }
        return { isError: true, error };
      }
      return { isError: false, structuredContent: structured as Record<string, unknown> };
    },
    close,
  };
}

/** Connects the combined local runtime through the official MCP protocol client. */
export async function createInMemoryCadMcpClient(repository: ModelProjectRepository): Promise<ConnectedCadMcpClient> {
  const server = createCadMcpServer(repository);
  const client = new Client({ name: "rjls-gateway", version: "0.1.0" }, { capabilities: {} });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

  return connectedClient(client, async () => { await Promise.allSettled([client.close(), server.close()]); });
}

/** Spawns and negotiates with the default standalone MCP stdio process. */
export async function createStdioCadMcpClient(parameters: StdioServerParameters): Promise<ConnectedCadMcpClient> {
  const client = new Client({ name: "rjls-gateway", version: "0.1.0" }, { capabilities: {} });
  const transport = new StdioClientTransport(parameters);
  await client.connect(transport);
  return connectedClient(client, async () => { await Promise.allSettled([client.close(), transport.close()]); }, transport.pid ?? undefined);
}
