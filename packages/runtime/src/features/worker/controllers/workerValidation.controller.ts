import {
  beginWorkerValidationSchema,
  completeWorkerValidationSchema,
  workerValidationCapabilitySchema,
} from "@theoryfoundry/contracts";
import type { WorkerValidationOperations } from "@theoryfoundry/model-project";
import { type WorkerRequestPolicy } from "../workerRequest.port.js";
import { handleWorkerJsonRequest } from "../workflows/workerRequest.workflow.js";
type WorkerValidationAction = "begin" | "status" | "complete" | "cancel";
type ValidationOperations = Pick<
  WorkerValidationOperations,
  WorkerValidationAction
>;
export function createWorkerValidationHandler(
  dependencies: WorkerRequestPolicy & {
    service: (ownerId: string) => ValidationOperations;
  },
) {
  return async (
    request: Request,
    action: WorkerValidationAction,
  ): Promise<Response> => {
    const schema =
      action === "begin"
        ? beginWorkerValidationSchema
        : action === "complete"
          ? completeWorkerValidationSchema
          : workerValidationCapabilitySchema;
    return handleWorkerJsonRequest<unknown, unknown>(request, dependencies, {
      schema,
      execute: (ownerId, input) => dependencies.service(ownerId)[action](input),
      unavailableCode: "WORKER_VALIDATION_UNAVAILABLE",
    });
  };
}
