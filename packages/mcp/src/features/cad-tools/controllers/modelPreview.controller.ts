import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  createCadToolCatalog,
  PREVIEW_LIMITS,
  previewMetadataSchema,
  type ModelPreviewService,
} from "@theoryfoundry/contracts";
import { CadDomainError } from "@theoryfoundry/model-project";

export function registerModelPreviewTool(
  server: McpServer,
  service: ModelPreviewService,
  signal?: AbortSignal,
): void {
  server.registerTool(
    "get_model_preview",
    {
      ...createCadToolCatalog().get_model_preview,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
      },
    },
    async (input, extra) => {
      try {
        const result = await service.getPreview(
          input,
          signal ? AbortSignal.any([signal, extra.signal]) : extra.signal,
        );
        const metadata = previewMetadataSchema.parse(result.metadata);
        const response = {
          content: [
            { type: "text" as const, text: JSON.stringify(metadata) },
            { type: "image" as const, mimeType: "image/png", data: result.png },
          ],
          structuredContent: metadata,
        };
        if (
          Buffer.byteLength(JSON.stringify(response)) >
          PREVIEW_LIMITS.payloadBytes
        )
          throw new CadDomainError(
            "ARTIFACT_LIMIT_EXCEEDED",
            "Preview exceeds the image response limit.",
          );
        return response;
      } catch (error) {
        const failure =
          error instanceof CadDomainError
            ? {
                code: error.code,
                message: error.message,
                details: error.details,
              }
            : { code: "INTERNAL_ERROR", message: "Preview service failed." };
        return {
          content: [
            { type: "text" as const, text: JSON.stringify({ error: failure }) },
          ],
          isError: true,
        };
      }
    },
  );
}
