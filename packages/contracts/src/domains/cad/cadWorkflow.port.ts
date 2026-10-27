import type * as z from "zod/v4";
import { type exportMetadataSchema } from "./export.schema.js";
import { type ExportReceipt } from "./cad.types.js";

export interface CadWorkflowService {
  projectUrl(projectId: string): string;
  inspect(projectId: string): Promise<{
    rendererAvailability: "ready" | "busy" | "unavailable";
    exports: z.infer<typeof exportMetadataSchema>[];
  }>;
  requireReady(projectId: string): Promise<void>;
  exportModel(input: {
    projectId: string;
    revision: string;
    format: "stl" | "3mf";
    signal?: AbortSignal;
  }): Promise<ExportReceipt>;
}
