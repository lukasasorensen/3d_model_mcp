import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { cadToolInstructions } from "@theoryfoundry/contracts";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import {
  validateLocally,
  previewLocally,
  exportLocally,
  type ComputeDependencies,
} from "./domains/compute/index.js";
import { WorkQueue } from "./features/operations/index.js";
import {
  registerLocalTools,
  type LocalToolOperations,
} from "./features/tools/index.js";
export function createLocalWorkerServer(
  dependencies: ComputeDependencies & Pick<LocalToolOperations, "callHosted">,
  version = "0.1.0",
): { server: McpServer; close(): Promise<void> } {
  const shutdown = new AbortController();
  const queue = new WorkQueue();
  const server = new McpServer(
    { name: "theoryfoundry-local-worker", version },
    { instructions: cadToolInstructions("local-worker") },
  );
  const hosted = new Set<Promise<CallToolResult>>();
  registerLocalTools(
    server,
    {
      callHosted: async (name, input, signal): Promise<CallToolResult> => {
        const pending = dependencies.callHosted(name, input, signal);
        hosted.add(pending);
        try {
          return await pending;
        } finally {
          hosted.delete(pending);
        }
      },
      availability: () =>
        !dependencies.renderer.available()
          ? "unavailable"
          : queue.busy
            ? "busy"
            : "ready",
      compute: (name, input, signal) =>
        queue.run(async (active): Promise<CallToolResult> => {
          if (name === "get_model_preview") {
            const result = await previewLocally(input, dependencies, active);
            return {
              content: [
                { type: "text", text: JSON.stringify(result.metadata) },
                { type: "image", mimeType: "image/png", data: result.png },
              ],
              structuredContent: result.metadata,
            };
          }
          const result =
            name === "validate_and_render"
              ? await validateLocally(input, dependencies, active)
              : await exportLocally(input, dependencies, active);
          return {
            content: [{ type: "text", text: JSON.stringify(result) }],
            structuredContent: result,
          };
        }, signal),
    },
    shutdown.signal,
  );
  let closing: Promise<void> | undefined;
  const close = (): Promise<void> =>
    (closing ??= (async (): Promise<void> => {
      shutdown.abort();
      try {
        await Promise.all([queue.close(), Promise.allSettled([...hosted])]);
      } finally {
        try {
          await dependencies.renderer.close();
        } finally {
          await server.close();
        }
      }
    })());
  server.server.onclose = (): void => {
    void close().catch(() => undefined);
  };
  return { server, close };
}
