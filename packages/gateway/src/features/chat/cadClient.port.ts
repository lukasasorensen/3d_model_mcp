import type { CadToolName } from "@theoryfoundry/mcp";
import type { ParameterToolError } from "@theoryfoundry/contracts";

export interface CadMcpToolResult {
  isError: boolean;
  structuredContent?: Record<string, unknown>;
  error?: {
    code: string;
    message: string;
    details?: ParameterToolError["details"];
  };
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
