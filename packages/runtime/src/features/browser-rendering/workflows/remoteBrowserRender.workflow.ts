import {
  browserRenderCompletionSchema,
  type CadRenderer,
  type CandidateRenderRequest,
  type RenderValidationResult,
} from "@theoryfoundry/contracts";
import type { RemoteRenderJobs } from "@theoryfoundry/model-project";
import {
  CadDomainError,
  type ProjectChangeSource,
} from "@theoryfoundry/model-project";
import { randomBytes } from "node:crypto";
import { recordRemoteMcpEvent } from "../../observability/index.js";
import { waitForRenderOutcome } from "../services/renderOutcome.service.js";
export class RemoteBrowserRenderer implements CadRenderer {
  constructor(
    private readonly jobs: RemoteRenderJobs,
    private readonly validationPolicyVersion: string,
    private readonly changes: ProjectChangeSource,
  ) {}

  async validateAndRender(
    request: CandidateRenderRequest,
  ): Promise<RenderValidationResult> {
    const jobId = `render-${randomBytes(18).toString("hex")}`;
    if (request.signal?.aborted)
      throw new CadDomainError("CANCELLED", "Rendering was cancelled.");
    await this.jobs.enqueue(jobId, request);
    try {
      return await waitForRenderOutcome<RenderValidationResult>({
        changes: this.changes,
        ownerId: this.jobs.ownerId,
        jobId,
        signal: request.signal,
        read: async () => {
          const job = await this.jobs.outcome(jobId);
          if (job?.state === "COMPLETED" && job.completion) {
            const completion = browserRenderCompletionSchema
              .pick({
                outcome: true,
                diagnostics: true,
                provenance: true,
                geometry: true,
              })
              .parse(job.completion);
            if (completion.outcome === "FAILED")
              throw new CadDomainError(
                "RENDER_FAILED",
                "Browser worker failed; retry the same candidate.",
                { retryable: true },
              );
            recordRemoteMcpEvent("render", completion.outcome);
            return {
              result: {
                ...completion,
                outcome: completion.outcome,
                validationPolicyVersion: this.validationPolicyVersion,
                artifacts: [],
              },
              deadline: 0,
            };
          }
          if (!job || job.state !== "PENDING")
            throw new CadDomainError(
              "BROWSER_RENDERER_UNAVAILABLE",
              "Open this project in a visible browser tab and retry the same candidate.",
              { retryable: true },
            );
          return {
            deadline: Math.min(
              new Date(job.deadline).getTime(),
              !job.claimed_at && job.claim_deadline
                ? new Date(job.claim_deadline).getTime()
                : Infinity,
            ),
          };
        },
      });
    } catch (error) {
      await this.jobs.cancel(jobId);
      recordRemoteMcpEvent(
        "render",
        request.signal?.aborted ? "cancelled" : "failed",
      );
      if (request.signal?.aborted)
        throw new CadDomainError("CANCELLED", "Rendering was cancelled.");
      throw error;
    }
  }
}
