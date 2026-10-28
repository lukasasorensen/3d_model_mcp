import { workerPreviewSourceInputSchema } from "@theoryfoundry/contracts";
import { WorkerPreviewSourceService } from "./preview-source.service.js";
import {
  handleWorkerJsonRequest,
  type WorkerRequestPolicy,
} from "./request.handler.js";

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
