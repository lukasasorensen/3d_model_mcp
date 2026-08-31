import { isBrowserRendererProvenance } from "@rjls/contracts";
import { PostgresModelProjectRepository, RemoteRenderJobsRepository, VALIDATION_POLICY_VERSION } from "@rjls/model-project";
import { createCadMcpServer } from "@rjls/mcp";
import { getProjectDatabase } from "./infrastructure.js";
import { claimRemoteBrowserRender, RemoteBrowserRenderer } from "./remote-browser-renderer.js";

export async function createRemoteCadMcpServer(ownerId: string, signal: AbortSignal) {
  const pool = getProjectDatabase().pool;
  const jobs = new RemoteRenderJobsRepository(pool, ownerId);
  await jobs.recover();
  return createCadMcpServer(new PostgresModelProjectRepository({
    pool, ownerId, renderer: new RemoteBrowserRenderer(jobs, VALIDATION_POLICY_VERSION),
    acceptRendererProvenance: isBrowserRendererProvenance,
  }), { signal });
}

export async function claimConfiguredRemoteRender(ownerId: string, projectId: string, sessionId: string) {
  return claimRemoteBrowserRender(new RemoteRenderJobsRepository(getProjectDatabase().pool, ownerId), projectId, sessionId);
}
