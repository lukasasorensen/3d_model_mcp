import { randomBytes } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { browserRenderCompletionSchema, type CadRenderer, type CandidateRenderRequest, type RenderValidationResult } from "@rjls/contracts";
import { CadDomainError, RemoteRenderJobsRepository, sha256 } from "@rjls/model-project";
import { recordRemoteMcpEvent } from "./remote-mcp-observability.js";

export class RemoteBrowserRenderer implements CadRenderer {
  constructor(private readonly jobs: RemoteRenderJobsRepository, private readonly validationPolicyVersion: string) {}

  async validateAndRender(request: CandidateRenderRequest): Promise<RenderValidationResult> {
    const jobId = `render-${randomBytes(18).toString("hex")}`;
    if (request.signal?.aborted) throw new CadDomainError("CANCELLED", "Rendering was cancelled.");
    await this.jobs.enqueue(jobId, request);
    try {
      for (;;) {
        if (request.signal?.aborted) throw new CadDomainError("CANCELLED", "Rendering was cancelled.");
        const job = await this.jobs.outcome(jobId);
        if (job?.state === "COMPLETED" && job.completion) {
          const completion = browserRenderCompletionSchema.pick({ outcome: true, diagnostics: true, provenance: true }).parse(job.completion);
          recordRemoteMcpEvent("render", completion.outcome);
          return { ...completion, validationPolicyVersion: this.validationPolicyVersion, artifacts: [] };
        }
        if (!job || job.state !== "PENDING") throw new CadDomainError("BROWSER_RENDERER_UNAVAILABLE", "Open this project in a visible browser tab, create a new candidate, and retry validation.");
        await delay(250, undefined, { signal: request.signal });
      }
    } catch (error) {
      await this.jobs.cancel(jobId);
      recordRemoteMcpEvent("render", request.signal?.aborted ? "cancelled" : "failed");
      if (request.signal?.aborted) throw new CadDomainError("CANCELLED", "Rendering was cancelled.");
      throw error;
    }
  }
}

export async function claimRemoteBrowserRender(jobs: RemoteRenderJobsRepository, projectId: string, sessionId: string) {
  const token = randomBytes(32).toString("hex");
  const job = await jobs.claim(projectId, sessionId, sha256(token));
  if (!job) return undefined;
  recordRemoteMcpEvent("render-claim", "claimed");
  return { ...job, token, purpose: "candidate" as const, format: "stl" as const };
}
