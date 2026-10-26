import { beginWorkerExportSchema, workerExportCapabilitySchema, workerExportUploadSchema } from "@theoryfoundry/contracts";
import { WorkerExportService, VALIDATION_POLICY_VERSION } from "@theoryfoundry/model-project";
import { getProjectDatabase } from "../infrastructure.js";
import { authenticateRemoteMcp } from "../remote-mcp-auth.js";
import { remoteMcpEnabled, remoteMcpIdentity } from "../remote-mcp-policy.js";
import { expectedBrowserProvenance } from "../browser-renderer.js";
import { createExportFileStore } from "../exports/file-store.factory.js";
import { ExportArtifactFinalizationService } from "../exports/artifact-finalization.service.js";
import { handleWorkerRequest, handleWorkerJsonRequest, type WorkerRequestPolicy } from "./request.handler.js";
import { readWorkerExportUpload } from "./export-upload.reader.js";

type ExportAction = "begin" | "status" | "complete" | "cancel";
export function createWorkerExportHandler(dependencies: WorkerRequestPolicy & {
  service: (ownerId: string) => Pick<WorkerExportService, ExportAction>;
}) {
  return (request: Request, action: ExportAction): Promise<Response> => {
    if (action === "complete") return handleWorkerRequest(request, dependencies, {
      read: readWorkerExportUpload, schema: workerExportUploadSchema, unavailableCode: "WORKER_EXPORT_UNAVAILABLE",
      execute: (ownerId, upload) => dependencies.service(ownerId).complete(upload.metadata, upload.bytes),
    });
    return handleWorkerJsonRequest<unknown, unknown>(request, dependencies, {
      schema: action === "begin" ? beginWorkerExportSchema : workerExportCapabilitySchema,
      unavailableCode: "WORKER_EXPORT_UNAVAILABLE",
      execute: (ownerId, input) => dependencies.service(ownerId)[action](input),
    });
  };
}

export const handleWorkerExportRequest = createWorkerExportHandler({
  authenticate: authenticateRemoteMcp,
  enabled: () => remoteMcpEnabled() && process.env.THEORYFOUNDRY_LOCAL_WORKER_ENABLED === "1",
  origin: () => remoteMcpIdentity().origin,
  service: ownerId => {
    const finalizer = new ExportArtifactFinalizationService(createExportFileStore());
    return new WorkerExportService(getProjectDatabase().pool, ownerId, remoteMcpIdentity().origin, {
      renderer: expectedBrowserProvenance(VALIDATION_POLICY_VERSION),
      finalize: (client, row, bytes, now) => finalizer.finalize(client, row, bytes, now),
    });
  },
});
