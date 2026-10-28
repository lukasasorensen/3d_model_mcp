import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import {
  StdioClientTransport,
  type StdioServerParameters,
} from "@modelcontextprotocol/sdk/client/stdio.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { CadWorkflowService } from "@theoryfoundry/contracts";
import { createCadMcpServer } from "@theoryfoundry/mcp";
import type { ModelProjectStore } from "@theoryfoundry/model-project";

import {
  connectedClient,
  type ConnectedCadMcpClient,
} from "./features/mcp/index.js";
/** Connects the combined local runtime through the official MCP protocol client. */
export async function createInMemoryCadMcpClient(
  repository: ModelProjectStore,
  workflowService?: CadWorkflowService,
): Promise<ConnectedCadMcpClient> {
  const server = createCadMcpServer(
    repository,
    workflowService ? { workflowService } : {},
  );
  const client = new Client(
    { name: "theoryfoundry-gateway", version: "0.1.0" },
    { capabilities: {} },
  );
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  try {
    await Promise.all([
      server.connect(serverTransport),
      client.connect(clientTransport),
    ]);
  } catch (error) {
    await Promise.allSettled([client.close(), server.close()]);
    throw error;
  }

  return connectedClient(client, async () => {
    await Promise.allSettled([client.close(), server.close()]);
  });
}

/** Spawns and negotiates with the default standalone MCP stdio process. */
export async function createStdioCadMcpClient(
  parameters: StdioServerParameters,
): Promise<ConnectedCadMcpClient> {
  const client = new Client(
    { name: "theoryfoundry-gateway", version: "0.1.0" },
    { capabilities: {} },
  );
  const transport = new StdioClientTransport(parameters);
  try {
    await client.connect(transport);
  } catch (error) {
    await Promise.allSettled([client.close(), transport.close()]);
    throw error;
  }
  return connectedClient(
    client,
    async () => {
      await Promise.allSettled([client.close(), transport.close()]);
    },
    transport.pid ?? undefined,
  );
}
