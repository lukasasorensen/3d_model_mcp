import {
  BROWSER_RENDERER,
  browserRenderCompletionSchema,
  type BrowserRenderCompletion,
  type CadRenderer,
  type CandidateRenderRequest,
  type RenderValidationResult,
} from "@theoryfoundry/contracts";
import { CadDomainError } from "@theoryfoundry/model-project";
import { randomBytes } from "node:crypto";
import type {
  BrowserRenderRequest,
  PendingJob,
  RequestListener,
} from "../browserRender.types.js";
import {
  BrowserRenderCompletionError,
  expectedBrowserProvenance,
  opaqueRandomId,
} from "../utils/browserProvenance.util.js";
export class BrowserRenderCoordinator implements CadRenderer {
  private readonly listeners = new Map<string, RequestListener>();
  private readonly pending = new Map<string, PendingJob>();

  constructor(private readonly validationPolicyVersion: string) {}

  subscribe(
    candidateId: string,
    sessionId: string,
    callback: (request: BrowserRenderRequest) => void,
  ): () => void {
    if (this.listeners.has(candidateId))
      throw new Error(
        "A browser renderer is already attached to this candidate.",
      );
    this.listeners.set(candidateId, { sessionId, callback });
    return () => this.listeners.delete(candidateId);
  }

  async validateAndRender(
    request: CandidateRenderRequest,
  ): Promise<RenderValidationResult> {
    const listener = this.listeners.get(request.candidateId);
    if (!listener) throw new Error("BROWSER_RENDERER_UNAVAILABLE");
    const jobId = opaqueRandomId("render");
    const token = randomBytes(32).toString("hex");
    const deadline = new Date(
      Date.now() + BROWSER_RENDERER.timeoutMs,
    ).toISOString();
    const completion = await new Promise<BrowserRenderCompletion>(
      (resolve, reject) => {
        const timeout = setTimeout(() => {
          this.pending.delete(jobId);
          reject(new Error("Browser rendering timed out."));
        }, BROWSER_RENDERER.timeoutMs);
        this.pending.set(jobId, {
          sessionId: listener.sessionId,
          token,
          sourceHash: request.sourceHash,
          resolve,
          reject,
          timeout,
        });
        const abort = (): void => {
          const pending = this.pending.get(jobId);
          if (!pending) return;
          clearTimeout(pending.timeout);
          this.pending.delete(jobId);
          reject(new Error("Browser rendering was cancelled."));
        };
        request.signal?.addEventListener("abort", abort, { once: true });
        listener.callback({
          jobId,
          token,
          purpose: "candidate",
          candidateId: request.candidateId,
          source: request.source,
          sourceHash: request.sourceHash,
          format: "stl",
          deadline,
        });
      },
    );
    if (completion.outcome === "FAILED")
      throw new CadDomainError(
        "RENDER_FAILED",
        "Browser worker failed; retry the same candidate.",
        { retryable: true },
      );
    return {
      geometry: completion.geometry,
      outcome: completion.outcome,
      diagnostics: completion.diagnostics,
      provenance: completion.provenance,
      validationPolicyVersion: this.validationPolicyVersion,
      artifacts: [],
    };
  }

  complete(jobId: string, raw: unknown): void {
    const pending = this.pending.get(jobId);
    if (!pending) throw new Error("Render job is unavailable or expired.");
    const completion = browserRenderCompletionSchema.parse(raw);
    if (
      completion.sessionId !== pending.sessionId ||
      completion.token !== pending.token ||
      completion.sourceHash !== pending.sourceHash
    ) {
      throw new BrowserRenderCompletionError(
        "Render completion binding failed.",
      );
    }
    const expected = expectedBrowserProvenance(this.validationPolicyVersion);
    if (JSON.stringify(completion.provenance) !== JSON.stringify(expected))
      throw new BrowserRenderCompletionError(
        "Browser renderer provenance does not match the configured pin.",
      );
    clearTimeout(pending.timeout);
    this.pending.delete(jobId);
    pending.resolve(completion);
  }
}
