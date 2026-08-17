import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { ModelProjectRepository } from "@rjls/model-project";

import { createCadToolRegistry, invokeCadTool, type CadToolName } from "./tools.js";

function mcpResult(result: Awaited<ReturnType<typeof invokeCadTool>>) {
  if (!result.ok) {
    return {
      content: [{ type: "text" as const, text: JSON.stringify({ error: result.error }) }],
      isError: true,
    };
  }
  const value = result.value;
  return {
    content: [{ type: "text" as const, text: JSON.stringify(value) }],
    structuredContent: value,
  };
}

/** Registers domain tools only. Stdio/HTTP lifecycle adapters are deliberately outside this core. */
export function createCadMcpServer(repository: ModelProjectRepository): McpServer {
  const registry = createCadToolRegistry(repository);
  const server = new McpServer(
    { name: "rjls-cad", version: "0.1.0" },
    { instructions: "Use only these project-scoped CAD tools. Never infer revision or artifact success from prose." },
  );

  for (const name of Object.keys(registry) as CadToolName[]) {
    const definition = registry[name];
    server.registerTool(
      name,
      {
        title: definition.title,
        description: definition.description,
        inputSchema: definition.inputSchema,
        outputSchema: definition.outputSchema,
        annotations: { readOnlyHint: definition.readOnly, openWorldHint: false, destructiveHint: false },
      },
      async (rawInput, extra) => mcpResult(await invokeCadTool(registry, name, rawInput, { signal: extra.signal })),
    );
  }
  return server;
}

/** Default standalone MCP lifecycle: protocol frames use stdout; diagnostics belong on stderr. */
export async function connectCadMcpStdio(repository: ModelProjectRepository): Promise<McpServer> {
  const server = createCadMcpServer(repository);
  await server.connect(new StdioServerTransport());
  return server;
}
