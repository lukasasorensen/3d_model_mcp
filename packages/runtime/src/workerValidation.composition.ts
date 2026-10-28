import { WorkerValidationService } from "@theoryfoundry/model-project";
import { getProjectDatabase } from "./database.composition.js";
import { remoteMcpEnabled, remoteMcpIdentity } from "./remote-mcp-policy.js";
import { authenticateRemoteMcp } from "./remoteAuth.composition.js";
import { createWorkerValidationHandler } from "./worker/validation.http.js";
export const handleWorkerValidationRequest = createWorkerValidationHandler({
  authenticate: authenticateRemoteMcp,
  service: (ownerId) =>
    new WorkerValidationService(getProjectDatabase().pool, ownerId),
  enabled: () =>
    remoteMcpEnabled() &&
    process.env.THEORYFOUNDRY_LOCAL_WORKER_ENABLED === "1",
  origin: () => remoteMcpIdentity().origin,
});
