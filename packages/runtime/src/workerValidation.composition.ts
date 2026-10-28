import { WorkerValidationService } from "@theoryfoundry/model-project";
import { getProjectDatabase } from "./database.composition.js";
import { createWorkerValidationHandler } from "./features/worker/index.js";
import { authenticateRemoteMcp } from "./remoteAuth.composition.js";
import {
  remoteMcpEnabled,
  remoteMcpIdentity,
} from "./shared/utils/remoteMcpPolicy.util.js";
export const handleWorkerValidationRequest = createWorkerValidationHandler({
  authenticate: authenticateRemoteMcp,
  service: (ownerId) =>
    new WorkerValidationService(getProjectDatabase().pool, ownerId),
  enabled: () =>
    remoteMcpEnabled() &&
    process.env.THEORYFOUNDRY_LOCAL_WORKER_ENABLED === "1",
  origin: () => remoteMcpIdentity().origin,
});
