import {
  BROWSER_RENDERER,
  browserRenderCompletionSchema,
  rendererProvenanceSchema,
  type BrowserRenderCompletion,
  type CadRenderer,
  type CandidateRenderRequest,
  type RenderValidationResult,
} from "@rjls/contracts";
import { randomBytes } from "node:crypto";

export const BROWSER_COMMAND_POLICY_VERSION = "openscad-browser-manifold-v1";
export const BROWSER_RENDERER_VERSION = "1.0.0";

export interface BrowserRenderRequest {
  jobId: string;
  token: string;
  purpose: "candidate";
  candidateId: string;
  source: string;
  sourceHash: string;
  format: "stl";
  deadline: string;
}

interface PendingJob {
  sessionId: string;
  token: string;
  sourceHash: string;
  resolve: (completion: BrowserRenderCompletion) => void;
  reject: (error: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
}

type RequestListener = { sessionId: string; callback: (request: BrowserRenderRequest) => void };

function opaqueRandomId(prefix: string): string {
  return `${prefix}-${randomBytes(18).toString("hex")}`;
}

export function expectedBrowserProvenance(validationPolicyVersion: string) {
  return rendererProvenanceSchema.parse({
    profile: "browser-wasm",
    renderer: "openscad-wasm",
    rendererVersion: BROWSER_RENDERER_VERSION,
    openscadVersion: BROWSER_RENDERER.openscadVersion,
    openscadWasmHash: `sha256:${BROWSER_RENDERER.openscadWasmSha256}`,
    openscadGlueHash: `sha256:${BROWSER_RENDERER.openscadGlueSha256}`,
    bosl2Version: BROWSER_RENDERER.bosl2Version,
    bosl2Digest: `sha256:${BROWSER_RENDERER.bosl2ArchiveSha256}`,
    backend: BROWSER_RENDERER.backend,
    commandPolicyVersion: BROWSER_COMMAND_POLICY_VERSION,
    validationPolicyVersion,
  });
}

export class BrowserRenderCoordinator implements CadRenderer {
  private readonly listeners = new Map<string, RequestListener>();
  private readonly pending = new Map<string, PendingJob>();

  constructor(private readonly validationPolicyVersion: string) {}

  subscribe(candidateId: string, sessionId: string, callback: (request: BrowserRenderRequest) => void): () => void {
    if (this.listeners.has(candidateId)) throw new Error("A browser renderer is already attached to this candidate.");
    this.listeners.set(candidateId, { sessionId, callback });
    return () => this.listeners.delete(candidateId);
  }

  async validateAndRender(request: CandidateRenderRequest): Promise<RenderValidationResult> {
    const listener = this.listeners.get(request.candidateId);
    if (!listener) throw new Error("BROWSER_RENDERER_UNAVAILABLE");
    const jobId = opaqueRandomId("render");
    const token = randomBytes(32).toString("hex");
    const deadline = new Date(Date.now() + BROWSER_RENDERER.timeoutMs).toISOString();
    const completion = await new Promise<BrowserRenderCompletion>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(jobId);
        reject(new Error("Browser rendering timed out."));
      }, BROWSER_RENDERER.timeoutMs);
      this.pending.set(jobId, { sessionId: listener.sessionId, token, sourceHash: request.sourceHash, resolve, reject, timeout });
      const abort = () => {
        const pending = this.pending.get(jobId);
        if (!pending) return;
        clearTimeout(pending.timeout);
        this.pending.delete(jobId);
        reject(new Error("Browser rendering was cancelled."));
      };
      request.signal?.addEventListener("abort", abort, { once: true });
      listener.callback({ jobId, token, purpose: "candidate", candidateId: request.candidateId, source: request.source, sourceHash: request.sourceHash, format: "stl", deadline });
    });
    return {
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
    if (completion.sessionId !== pending.sessionId || completion.token !== pending.token || completion.sourceHash !== pending.sourceHash) {
      throw new Error("Render completion binding failed.");
    }
    const expected = expectedBrowserProvenance(this.validationPolicyVersion);
    if (JSON.stringify(completion.provenance) !== JSON.stringify(expected)) throw new Error("Browser renderer provenance does not match the configured pin.");
    clearTimeout(pending.timeout);
    this.pending.delete(jobId);
    pending.resolve(completion);
  }
}
