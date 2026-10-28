import { ModelSourceRepository } from "@theoryfoundry/model-project";
import { getProjectDatabase } from "./database.composition.js";
import { remoteMcpEnabled, remoteMcpIdentity } from "./remote-mcp-policy.js";
import { authenticateRemoteMcp } from "./remoteAuth.composition.js";
import { createWorkerPreviewSourceHandler } from "./worker/preview-source.http.js";
import { WorkerPreviewSourceService } from "./worker/preview-source.service.js";
export const handleWorkerPreviewSourceRequest =
  createWorkerPreviewSourceHandler({
    authenticate: authenticateRemoteMcp,
    service: (ownerId) =>
      new WorkerPreviewSourceService(
        new ModelSourceRepository(getProjectDatabase().pool, ownerId),
      ),
    enabled: () =>
      remoteMcpEnabled() &&
      process.env.THEORYFOUNDRY_LOCAL_WORKER_ENABLED === "1",
    origin: () => remoteMcpIdentity().origin,
  });
