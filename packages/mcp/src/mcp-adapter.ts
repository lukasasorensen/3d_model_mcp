import type { CadWorkflowService, ModelPreviewService } from "@rjls/contracts";
import { registerModelPreviewTool } from "./model-preview-tool.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { ModelProjectStore } from "@rjls/model-project";

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
export function createCadMcpServer(repository: ModelProjectStore, options: { signal?: AbortSignal; workflowService?: CadWorkflowService; previewService?: ModelPreviewService } = {}): McpServer {
  const registry = createCadToolRegistry(repository, options.workflowService);
  const server = new McpServer(
    { name: "rjls-cad", version: "0.1.0" },
    { instructions: "Use only these project-scoped CAD tools. Inspect project state before editing, propose source against the exact current parent, validate_and_render before promotion, and promote only a VALID candidate. Browser validation requires the matching CAD project to be open in a visible browser tab. Never infer revision or artifact success from prose." },
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
      async (rawInput, extra) => mcpResult(await invokeCadTool(registry, name, rawInput, { signal: options.signal ? AbortSignal.any([options.signal, extra.signal]) : extra.signal })),
    );
  }
  if (options.previewService) registerModelPreviewTool(server, options.previewService, options.signal);
  return server;
}

/** Default standalone MCP lifecycle: protocol frames use stdout; diagnostics belong on stderr. */
export async function connectCadMcpStdio(repository: ModelProjectStore, options: { workflowService?: CadWorkflowService; previewService?: ModelPreviewService } = {}): Promise<McpServer> {
  const server = createCadMcpServer(repository, options);
  await server.connect(new StdioServerTransport());
  return server;
}
