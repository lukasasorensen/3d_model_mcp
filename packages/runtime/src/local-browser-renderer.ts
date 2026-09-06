import { type BrowserRenderCompletion, type LocalMcpBrowserRenderJob, localMcpBrowserRenderJobSchema } from "@rjls/contracts";
import { RemoteRenderJobsRepository, type ProjectDatabase } from "@rjls/model-project";
import { PostgresBrowserRenderCoordinator } from "./browser-renderer.js";
import { claimMcpBrowserRender } from "./remote-browser-renderer.js";

/** Local HTTP compatibility adapter over the same atomic database claims as remote MCP. */
export class LocalBrowserRenderer {
  private readonly jobs: RemoteRenderJobsRepository;
  private readonly completions: PostgresBrowserRenderCoordinator;
  constructor(database: ProjectDatabase, ownerId: string, validationPolicyVersion: string) {
    this.jobs = new RemoteRenderJobsRepository(database.pool, ownerId, "local-mcp");
    this.completions = new PostgresBrowserRenderCoordinator(validationPolicyVersion, database.pool, ownerId, database.notifications);
  }
  async claimNext(projectId: string, sessionId: string): Promise<LocalMcpBrowserRenderJob | null> {
    const job = await claimMcpBrowserRender(this.jobs, projectId, sessionId);
    if (!job) return null;
    return localMcpBrowserRenderJobSchema.parse({ jobId: job.jobId, candidateId: job.candidateId, source: job.source, sourceHash: job.sourceHash, token: job.token, deadline: job.deadline, format: job.format, version: "1", projectId, createdAt: job.createdAt });
  }
  async complete(jobId: string, raw: unknown): Promise<void> {
    // Verify delivery mode before using the shared completion binding checks.
    if (!await this.jobs.outcome(jobId)) throw new Error("Local render job unavailable.");
    await this.completions.complete(jobId, raw as BrowserRenderCompletion);
  }
}
