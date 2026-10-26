import { workerPreviewSourceInputSchema } from "@theoryfoundry/contracts";
import { ModelSourceRepository } from "@theoryfoundry/model-project";
import { getProjectDatabase } from "../infrastructure.js";
import { authenticateRemoteMcp } from "../remote-mcp-auth.js";
import { remoteMcpEnabled, remoteMcpIdentity } from "../remote-mcp-policy.js";
import { WorkerPreviewSourceService } from "./preview-source.service.js";
import { handleWorkerJsonRequest, type WorkerRequestPolicy } from "./request.handler.js";

export function createWorkerPreviewSourceHandler(dependencies: WorkerRequestPolicy & {
  service: (ownerId: string) => Pick<WorkerPreviewSourceService, "resolve">;
}) {
  return (request: Request): Promise<Response> => handleWorkerJsonRequest(request, dependencies, {
    schema: workerPreviewSourceInputSchema,
    execute: (ownerId, input) => dependencies.service(ownerId).resolve(input),
    unavailableCode: "WORKER_PREVIEW_SOURCE_UNAVAILABLE",
  });
}

export const handleWorkerPreviewSourceRequest = createWorkerPreviewSourceHandler({
  authenticate: authenticateRemoteMcp,
  service: ownerId => new WorkerPreviewSourceService(new ModelSourceRepository(getProjectDatabase().pool, ownerId)),
  enabled: () => remoteMcpEnabled() && process.env.THEORYFOUNDRY_LOCAL_WORKER_ENABLED === "1",
  origin: () => remoteMcpIdentity().origin,
});
