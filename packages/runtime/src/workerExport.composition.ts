import {
  VALIDATION_POLICY_VERSION,
  WorkerExportService,
} from "@theoryfoundry/model-project";
import { expectedBrowserProvenance } from "./browser-renderer.js";
import { getProjectDatabase } from "./database.composition.js";
import { ExportArtifactFinalizationService } from "./exports/artifact-finalization.service.js";
import { createExportFileStore } from "./exports/file-store.factory.js";
import { remoteMcpEnabled, remoteMcpIdentity } from "./remote-mcp-policy.js";
import { authenticateRemoteMcp } from "./remoteAuth.composition.js";
import { createWorkerExportHandler } from "./worker/export.http.js";
export const handleWorkerExportRequest = createWorkerExportHandler({
  authenticate: authenticateRemoteMcp,
  enabled: () =>
    remoteMcpEnabled() &&
    process.env.THEORYFOUNDRY_LOCAL_WORKER_ENABLED === "1",
  origin: () => remoteMcpIdentity().origin,
  service: (ownerId) => {
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
