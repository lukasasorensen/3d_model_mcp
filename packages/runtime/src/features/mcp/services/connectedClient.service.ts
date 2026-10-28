import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import type { CadMcpToolResult } from "@theoryfoundry/gateway";
import { type CadToolName } from "@theoryfoundry/mcp";
import type { ConnectedCadMcpClient } from "../connectedClient.port.js";
export function connectedClient(
  client: Client,
  close: () => Promise<void>,
  processId?: number,
): ConnectedCadMcpClient {
  return {
    ...(processId ? { processId } : {}),
    async listTools(options): Promise<string[]> {
      const response = await client.listTools(undefined, {
        ...(options.signal ? { signal: options.signal } : {}),
      });
      return response.tools.map((definition) => definition.name);
    },
    async callTool(
      name: CadToolName,
      input: Record<string, unknown>,
      options,
    ): Promise<CadMcpToolResult> {
      const response = await client.callTool(
        { name, arguments: input },
        undefined,
        { ...(options.signal ? { signal: options.signal } : {}) },
      );
      const structured = response.structuredContent;
      if (
        response.isError ||
        !structured ||
        typeof structured !== "object" ||
        Array.isArray(structured)
      ) {
        const content = Array.isArray(response.content) ? response.content : [];
        const firstText = content.find(
          (item): item is { type: "text"; text: string } =>
            typeof item === "object" &&
            item !== null &&
            "type" in item &&
            item.type === "text" &&
            "text" in item &&
            typeof item.text === "string",
        )?.text;
        let error: { code: string; message: string } | undefined;
        try {
          const parsed = JSON.parse(firstText ?? "") as {
            error?: { code?: unknown; message?: unknown };
          };
          if (
            typeof parsed.error?.code === "string" &&
            typeof parsed.error.message === "string"
          )
            error = { code: parsed.error.code, message: parsed.error.message };
        } catch {
          /* public gateway applies a fixed safe error */
        }
        return { isError: true, ...(error ? { error } : {}) };
      }
      return {
        isError: false,
        structuredContent: structured as Record<string, unknown>,
      };
    },
    close,
  };
}
