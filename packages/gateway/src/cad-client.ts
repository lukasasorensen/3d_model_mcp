import type { CadToolName } from "@rjls/mcp";

export interface CadMcpToolResult {
  isError: boolean;
  structuredContent?: Record<string, unknown>;
  error?: { code: string; message: string };
}

/** The agent sees CAD only through this narrow MCP client boundary. */
export interface CadMcpClient {
  listTools(options: { signal?: AbortSignal }): Promise<readonly string[]>;
  callTool(
    name: CadToolName,
    input: Record<string, unknown>,
    options: { signal?: AbortSignal },
  ): Promise<CadMcpToolResult>;
}
