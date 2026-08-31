type RemoteEvent = "authentication" | "request" | "render-claim" | "render";
/** Deliberately excludes headers, tokens, URLs, queries, and source content. */
export function recordRemoteMcpEvent(event: RemoteEvent, outcome: string, durationMs?: number, toolName?: string): void {
  process.stderr.write(`${JSON.stringify({ service: "remote-mcp", event, outcome, ...(toolName ? { tool: toolName } : {}), ...(durationMs === undefined ? {} : { durationMs: Math.round(durationMs) }) })}\n`);
}
