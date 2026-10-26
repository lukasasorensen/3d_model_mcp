import { beginWorkerValidationSchema, completeWorkerValidationSchema, workerValidationCapabilitySchema } from "@theoryfoundry/contracts";
import { WorkerValidationService } from "@theoryfoundry/model-project";
import { authenticateRemoteMcp } from "../remote-mcp-auth.js";
import { remoteMcpEnabled, remoteMcpIdentity } from "../remote-mcp-policy.js";
import { getProjectDatabase } from "../infrastructure.js";
import { handleWorkerJsonRequest, type WorkerRequestPolicy } from "./request.handler.js";

type WorkerValidationAction = "begin" | "status" | "complete" | "cancel";
type ValidationOperations = Pick<WorkerValidationService, WorkerValidationAction>;
export function createWorkerValidationHandler(dependencies: WorkerRequestPolicy & {
  service: (ownerId: string) => ValidationOperations;
}) {
  return async (request: Request, action: WorkerValidationAction): Promise<Response> => {
    const schema = action === "begin" ? beginWorkerValidationSchema : action === "complete" ? completeWorkerValidationSchema : workerValidationCapabilitySchema;
    return handleWorkerJsonRequest<unknown, unknown>(request, dependencies, {
      schema,
      execute: (ownerId, input) => dependencies.service(ownerId)[action](input),
      unavailableCode: "WORKER_VALIDATION_UNAVAILABLE",
    });
  };
}

export const handleWorkerValidationRequest = createWorkerValidationHandler({
  authenticate: authenticateRemoteMcp,
  service: ownerId => new WorkerValidationService(getProjectDatabase().pool, ownerId),
  enabled: () => remoteMcpEnabled() && process.env.THEORYFOUNDRY_LOCAL_WORKER_ENABLED === "1",
  origin: () => remoteMcpIdentity().origin,
});
