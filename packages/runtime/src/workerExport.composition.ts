import {
  VALIDATION_POLICY_VERSION,
  WorkerExportService,
} from "@theoryfoundry/model-project";
import { getProjectDatabase } from "./database.composition.js";
import { createExportFileStore } from "./exportFileStore.composition.js";
import { expectedBrowserProvenance } from "./features/browser-rendering/index.js";
import { ExportArtifactFinalizationService } from "./features/model-export/index.js";
import { createWorkerExportHandler } from "./features/worker/index.js";
import { authenticateRemoteMcp } from "./remoteAuth.composition.js";
import {
  remoteMcpEnabled,
  remoteMcpIdentity,
} from "./shared/utils/remoteMcpPolicy.util.js";
export const handleWorkerExportRequest = createWorkerExportHandler({
  authenticate: authenticateRemoteMcp,
  enabled: () =>
    remoteMcpEnabled() &&
    process.env.THEORYFOUNDRY_LOCAL_WORKER_ENABLED === "1",
  origin: () => remoteMcpIdentity().origin,
  service: (ownerId): WorkerExportService => {
    const finalizer = new ExportArtifactFinalizationService(
      createExportFileStore(),
    );
    return new WorkerExportService(
      getProjectDatabase().pool,
      ownerId,
      remoteMcpIdentity().origin,
      {
        renderer: expectedBrowserProvenance(VALIDATION_POLICY_VERSION),
        finalize: (client, row, bytes, now) =>
          finalizer.finalize(client, row, bytes, now),
      },
    );
  },
});
