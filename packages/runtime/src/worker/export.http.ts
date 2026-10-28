import {
  beginWorkerExportSchema,
  workerExportCapabilitySchema,
  workerExportUploadSchema,
} from "@theoryfoundry/contracts";
import { WorkerExportOperations } from "@theoryfoundry/model-project";
import { readWorkerExportUpload } from "./export-upload.reader.js";
import {
  handleWorkerJsonRequest,
  handleWorkerRequest,
  type WorkerRequestPolicy,
} from "./request.handler.js";

type ExportAction = "begin" | "status" | "complete" | "cancel";
export function createWorkerExportHandler(
  dependencies: WorkerRequestPolicy & {
    service: (ownerId: string) => Pick<WorkerExportOperations, ExportAction>;
  },
) {
  return (request: Request, action: ExportAction): Promise<Response> => {
    if (action === "complete")
      return handleWorkerRequest(request, dependencies, {
        read: readWorkerExportUpload,
        schema: workerExportUploadSchema,
        unavailableCode: "WORKER_EXPORT_UNAVAILABLE",
        execute: (ownerId, upload) =>
          dependencies.service(ownerId).complete(upload.metadata, upload.bytes),
      });
    return handleWorkerJsonRequest<unknown, unknown>(request, dependencies, {
      schema:
        action === "begin"
          ? beginWorkerExportSchema
          : workerExportCapabilitySchema,
      unavailableCode: "WORKER_EXPORT_UNAVAILABLE",
      execute: (ownerId, input) => dependencies.service(ownerId)[action](input),
    });
  };
}
