import {
  getModelPreviewInputSchema,
  type ModelPreviewInput,
  type ModelPreviewService,
  type PreviewMetadata,
} from "@theoryfoundry/contracts";
import type {
  BrowserPresenceStore,
  BrowserPreviewStore,
} from "@theoryfoundry/model-project";
import {
  CadDomainError,
  sha256,
  type ModelProjectStore,
  type ProjectChangeSource,
} from "@theoryfoundry/model-project";
import { randomUUID } from "node:crypto";
import { waitForRenderOutcome } from "../../browser-rendering/index.js";
import { validatePreviewPng } from "../utils/previewPng.util.js";
export class ModelPreviewWorkflow implements ModelPreviewService {
  constructor(
    private readonly changes: ProjectChangeSource,
    private readonly repository: ModelProjectStore,
    private readonly ownerId: string,
    private readonly mode: "local-mcp" | "remote-mcp",
    private readonly jobs: BrowserPreviewStore,
    private readonly presence: BrowserPresenceStore,
    private readonly origin: () => string,
  ) {}
  async getPreview(
    raw: ModelPreviewInput,
    signal?: AbortSignal,
  ): Promise<{ metadata: PreviewMetadata; png: string }> {
    const input = getModelPreviewInputSchema.parse(raw);
    signal?.throwIfAborted();
    const target = input.candidateId
      ? await this.repository.readValidatedCandidateSource(
          input.projectId,
          input.candidateId,
        )
      : await this.repository.readModelSource(
          input.projectId,
          input.revisionId,
        );
    if (sha256(target.source) !== target.sourceHash)
      throw new CadDomainError(
        "SOURCE_HASH_MISMATCH",
        "Preview source integrity failed.",
      );
    const metadata = {
      projectId: input.projectId,
      ...("revision" in target
        ? { revisionId: target.revision }
        : { candidateId: target.candidateId }),
      sourceHash: target.sourceHash,
      view: input.view,
      width: 768 as const,
      height: 768 as const,
    };
    const jobs = this.jobs;
    await jobs.sweep();
    const availability = await this.presence.availability(
      input.projectId,
      this.mode,
    );
    const projectUrl = `${this.origin()}/projects/${encodeURIComponent(input.projectId)}`;
    if (availability !== "ready")
      throw new CadDomainError(
        availability === "busy" ? "BROWSER_BUSY" : "BROWSER_REQUIRED",
        availability === "busy"
          ? "The project browser is busy. Retry after rendering finishes."
          : "Use browser tools to focus an existing project tab or open the project URL visibly, sign in if needed, then retry. Without browser tools, show the user the link.",
        { projectUrl, availability },
      );
    const id = `preview-${randomUUID()}`;
    const started = Date.now();
    let outcome = "failed";
    let byteCount = 0;
    await jobs.enqueue(id, metadata, target.source, this.mode);
    try {
      const result = await waitForRenderOutcome<{
        metadata: PreviewMetadata;
        png: string;
      }>({
        changes: this.changes,
        ownerId: this.ownerId,
        jobId: id,
        signal,
        read: async () => {
          const job = await jobs.outcome(id);
          if (!job)
            throw new CadDomainError(
              "PREVIEW_TIMEOUT",
              "Preview expired. Retry with the project visible.",
              { projectUrl },
            );
          if (job.state === "COMPLETED") {
            if (!job.completion?.png)
              throw new CadDomainError(
                "RENDER_FAILED",
                "The browser could not render the preview.",
              );
            const bytes = validatePreviewPng(job.completion.png);
            byteCount = bytes.length;
            return {
              result: {
                metadata: { ...metadata, imageHash: sha256(bytes) },
                png: job.completion.png,
              },
              deadline: 0,
            };
          }
          const deadline = Math.min(
            new Date(job.deadline).getTime(),
            job.claimed_at ? Infinity : new Date(job.claim_deadline).getTime(),
          );
          if (Date.now() >= deadline)
            throw new CadDomainError(
              "PREVIEW_TIMEOUT",
              "Preview expired. Focus the project tab and retry.",
              { projectUrl },
            );
          return { deadline };
        },
      });
      outcome = "completed";
      return result;
    } catch (error) {
      if (signal?.aborted) {
        outcome = "cancelled";
        throw new CadDomainError("CANCELLED", "Preview cancelled.");
      }
      throw error;
    } finally {
      await jobs.remove(id);
      process.stderr.write(
        `${JSON.stringify({ event: "model-preview", outcome, durationMs: Date.now() - started, byteCount })}\n`,
      );
    }
  }
}
