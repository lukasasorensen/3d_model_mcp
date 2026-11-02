import { WorkerValidationService } from "@theoryfoundry/model-project";
import { getProjectDatabase } from "./database.composition.js";
import { createWorkerValidationHandler } from "./features/worker/index.js";
import { authenticateRemoteMcp } from "./remoteAuth.composition.js";
import { remoteMcpIdentity } from "./shared/utils/remoteMcpPolicy.util.js";
import { localWorkerEnabled } from "./shared/utils/localWorkerPolicy.util.js";
export const handleWorkerValidationRequest = createWorkerValidationHandler({
  authenticate: authenticateRemoteMcp,
  service: (ownerId) =>
    new WorkerValidationService(getProjectDatabase().pool, ownerId),
  enabled: localWorkerEnabled,
  origin: () => remoteMcpIdentity().origin,
});
