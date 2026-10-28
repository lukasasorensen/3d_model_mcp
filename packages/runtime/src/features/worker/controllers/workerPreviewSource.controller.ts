import { workerPreviewSourceInputSchema } from "@theoryfoundry/contracts";
import type { WorkerPreviewSourceService } from "../services/workerPreviewSource.service.js";
import { type WorkerRequestPolicy } from "../workerRequest.port.js";
import { handleWorkerJsonRequest } from "../workflows/workerRequest.workflow.js";
export function createWorkerPreviewSourceHandler(
  dependencies: WorkerRequestPolicy & {
    service: (ownerId: string) => Pick<WorkerPreviewSourceService, "resolve">;
  },
) {
  return (request: Request): Promise<Response> =>
    handleWorkerJsonRequest(request, dependencies, {
      schema: workerPreviewSourceInputSchema,
      execute: (ownerId, input) => dependencies.service(ownerId).resolve(input),
      unavailableCode: "WORKER_PREVIEW_SOURCE_UNAVAILABLE",
    });
}
