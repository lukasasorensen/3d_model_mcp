import { isBrowserRendererProvenance } from "@theoryfoundry/contracts";
import { createCadMcpServer } from "@theoryfoundry/mcp";
import {
  BrowserPreviewJobsRepository,
  PostgresModelProjectRepository,
  RemoteRenderJobsRepository,
  VALIDATION_POLICY_VERSION,
} from "@theoryfoundry/model-project";
import { RuntimeCadWorkflowService } from "./cadWorkflow.composition.js";
import { getProjectDatabase } from "./database.composition.js";
import {
  claimRemoteBrowserRender,
  RemoteBrowserRenderer,
} from "./features/browser-rendering/index.js";
import { recordRemoteMcpEvent } from "./features/observability/index.js";
import { PostgresModelPreviewService } from "./modelPreview.composition.js";
export async function createRemoteCadMcpServer(
  ownerId: string,
  signal: AbortSignal,
) {
  const pool = getProjectDatabase().pool;
  const jobs = new RemoteRenderJobsRepository(pool, ownerId);
  await jobs.recover();
  await new BrowserPreviewJobsRepository(pool, ownerId).sweep();
  const repository = new PostgresModelProjectRepository({
    pool,
    ownerId,
    renderer: new RemoteBrowserRenderer(
      jobs,
      VALIDATION_POLICY_VERSION,
      getProjectDatabase().notifications,
    ),
    acceptRendererProvenance: isBrowserRendererProvenance,
  });
  return createCadMcpServer(repository, {
    signal,
    workflowService: new RuntimeCadWorkflowService(
      getProjectDatabase(),
      repository,
      ownerId,
      "remote-mcp",
    ),
    previewService: new PostgresModelPreviewService(
      getProjectDatabase(),
      repository,
      ownerId,
      "remote-mcp",
    ),
  });
}

export async function claimConfiguredRemoteRender(
  ownerId: string,
  projectId: string,
  sessionId: string,
) {
  return claimRemoteBrowserRender(
    new RemoteRenderJobsRepository(getProjectDatabase().pool, ownerId),
    projectId,
    sessionId,
    () => recordRemoteMcpEvent("render-claim", "claimed"),
  );
}
