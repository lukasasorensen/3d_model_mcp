import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
export interface LocalToolOperations {
  callHosted(
    name: string,
    input: Record<string, unknown>,
    signal: AbortSignal,
  ): Promise<CallToolResult>;
  compute(
    name: string,
    input: unknown,
    signal: AbortSignal,
  ): Promise<CallToolResult>;
  availability(): "ready" | "busy" | "unavailable";
}
