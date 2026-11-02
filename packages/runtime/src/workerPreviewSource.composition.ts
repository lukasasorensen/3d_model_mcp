import { ModelSourceRepository } from "@theoryfoundry/model-project";
import { getProjectDatabase } from "./database.composition.js";
import {
  createWorkerPreviewSourceHandler,
  WorkerPreviewSourceService,
} from "./features/worker/index.js";
import { authenticateRemoteMcp } from "./remoteAuth.composition.js";
import { remoteMcpIdentity } from "./shared/utils/remoteMcpPolicy.util.js";
import { localWorkerEnabled } from "./shared/utils/localWorkerPolicy.util.js";
export const handleWorkerPreviewSourceRequest =
  createWorkerPreviewSourceHandler({
    authenticate: authenticateRemoteMcp,
    service: (ownerId) =>
      new WorkerPreviewSourceService(
        new ModelSourceRepository(getProjectDatabase().pool, ownerId),
      ),
    enabled: localWorkerEnabled,
    origin: () => remoteMcpIdentity().origin,
  });
