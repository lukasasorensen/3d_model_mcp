import { randomBytes } from "node:crypto";
import { waitForRenderOutcome } from "./render-outcome-wait.js";
import { browserRenderCompletionSchema, type CadRenderer, type CandidateRenderRequest, type RenderValidationResult } from "@rjls/contracts";
import { CadDomainError, RemoteRenderJobsRepository, type ProjectChangeSource, sha256 } from "@rjls/model-project";
import { recordRemoteMcpEvent } from "./remote-mcp-observability.js";

export class RemoteBrowserRenderer implements CadRenderer {
  constructor(private readonly jobs: RemoteRenderJobsRepository, private readonly validationPolicyVersion: string, private readonly changes: ProjectChangeSource) {}

  async validateAndRender(request: CandidateRenderRequest): Promise<RenderValidationResult> {
    const jobId = `render-${randomBytes(18).toString("hex")}`;
    if (request.signal?.aborted) throw new CadDomainError("CANCELLED", "Rendering was cancelled.");
    await this.jobs.enqueue(jobId, request);
    try {
      return await waitForRenderOutcome<RenderValidationResult>({
        changes: this.changes, ownerId: this.jobs.ownerId, jobId, signal: request.signal,
        read: async () => {
          const job = await this.jobs.outcome(jobId);
          if (job?.state === "COMPLETED" && job.completion) {
            const completion = browserRenderCompletionSchema.pick({ outcome: true, diagnostics: true, provenance: true }).parse(job.completion);
            recordRemoteMcpEvent("render", completion.outcome);
            return { result: { ...completion, validationPolicyVersion: this.validationPolicyVersion, artifacts: [] }, deadline: 0 };
          }
          if (!job || job.state !== "PENDING") throw new CadDomainError("BROWSER_RENDERER_UNAVAILABLE", "Open this project in a visible browser tab, create a new candidate, and retry validation.");
          return { deadline: Math.min(new Date(job.deadline).getTime(), !job.claimed_at && job.claim_deadline ? new Date(job.claim_deadline).getTime() : Infinity) };
        },
      });
    } catch (error) {
      await this.jobs.cancel(jobId);
      recordRemoteMcpEvent("render", request.signal?.aborted ? "cancelled" : "failed");
      if (request.signal?.aborted) throw new CadDomainError("CANCELLED", "Rendering was cancelled.");
      throw error;
    }
  }
}

export async function claimMcpBrowserRender(jobs: RemoteRenderJobsRepository, projectId: string, sessionId: string) {
  const token = randomBytes(32).toString("hex");
  const job = await jobs.claim(projectId, sessionId, sha256(token));
  if (!job) return undefined;
  recordRemoteMcpEvent("render-claim", "claimed");
  return { ...job, token, purpose: "candidate" as const, format: "stl" as const };
}

export async function claimRemoteBrowserRender(jobs: RemoteRenderJobsRepository, projectId: string, sessionId: string) {
  const job = await claimMcpBrowserRender(jobs, projectId, sessionId);
  if (!job) return undefined;
  return { jobId: job.jobId, candidateId: job.candidateId, source: job.source, sourceHash: job.sourceHash, deadline: job.deadline, token: job.token, purpose: job.purpose, format: job.format };
}
