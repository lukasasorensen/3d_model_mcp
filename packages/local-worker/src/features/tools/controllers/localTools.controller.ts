import type * as z from "zod/v4";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import {
  CAD_LIMITS,
  PREVIEW_LIMITS,
  createCadToolCatalog,
  getProjectStateOutputSchema,
} from "@theoryfoundry/contracts";
import { WorkerAuthError } from "@theoryfoundry/worker-auth";
import { LocalWorkerError } from "../../../shared/utils/workerError.util.js";
import type { LocalToolOperations } from "../tools.port.js";
export function registerLocalTools(
  server: McpServer,
  operations: LocalToolOperations,
  shutdown: AbortSignal,
): void {
  for (const [name, metadata] of Object.entries(
    createCadToolCatalog("local-worker"),
  )) {
    server.registerTool<z.ZodObject<z.ZodRawShape>, z.ZodObject<z.ZodRawShape>>(
      name,
      {
        ...metadata,
        annotations: {
          readOnlyHint: metadata.readOnly,
          destructiveHint: false,
          openWorldHint: false,
        },
      },
      async (input, extra): Promise<CallToolResult> => {
        const signal = AbortSignal.any([extra.signal, shutdown]);
        try {
          signal.throwIfAborted();
          const result = [
            "validate_and_render",
            "get_model_preview",
            "export_model",
          ].includes(name)
            ? await operations.compute(name, input, signal)
            : await operations.callHosted(name, input, signal);
          signal.throwIfAborted();
          const limit =
            name === "get_model_preview"
              ? PREVIEW_LIMITS.payloadBytes
              : CAD_LIMITS.toolResultBytes;
          if (Buffer.byteLength(JSON.stringify(result)) > limit)
            throw new LocalWorkerError(
              "RESULT_TOO_LARGE",
              "Tool response exceeds its byte limit.",
            );
          if (result.isError) return result;
          const value: unknown =
            result.structuredContent ??
            JSON.parse(
              result.content.find((part) => part.type === "text")?.text ??
                "null",
            );
          const parsed = metadata.outputSchema.parse(value);
          if (name === "get_project_state") {
            const state = getProjectStateOutputSchema.parse(parsed);
            state.state.rendererAvailability = operations.availability();
            return {
              content: [{ type: "text", text: JSON.stringify(state) }],
              structuredContent: state,
            };
          }
          return { ...result, structuredContent: parsed };
        } catch (error) {
          const failure = signal.aborted
            ? { code: "CANCELLED", message: "Worker operation was cancelled." }
            : error instanceof DOMException && error.name === "TimeoutError"
              ? {
                  code: "WORKER_TIMEOUT",
                  message:
                    "Worker operation exceeded its deadline; retry the same target.",
                }
              : error instanceof WorkerAuthError ||
                  error instanceof LocalWorkerError
                ? {
                    code: error.code,
                    message: error.message,
                    ...(error instanceof LocalWorkerError && error.details
                      ? { details: error.details }
                      : {}),
                  }
                : {
                    code: "WORKER_REQUEST_FAILED",
                    message:
                      "Worker request failed. Check hosted connectivity and authentication, then retry.",
                  };
          return {
            isError: true,
            content: [
              { type: "text", text: JSON.stringify({ error: failure }) },
            ],
          };
        }
      },
    );
  }
}
