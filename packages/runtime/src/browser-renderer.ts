import {
  BROWSER_RENDERER,
  browserRenderCompletionSchema,
  rendererProvenanceSchema,
  type BrowserRenderCompletion,
  type CadRenderer,
  type CandidateRenderRequest,
  type RenderValidationResult,
} from "@rjls/contracts";
import { PostgresProjectNotifications, type ProjectChangeSource, CadDomainError, sha256 } from "@rjls/model-project";
import { waitForRenderOutcome } from "./render-outcome-wait.js";
import { randomBytes } from "node:crypto";
import type { Pool } from "pg";

export class BrowserRenderCompletionError extends Error {}

export const BROWSER_COMMAND_POLICY_VERSION = "openscad-browser-manifold-v1";
export const BROWSER_RENDERER_VERSION = "1.0.0";
const storedBrowserCompletionSchema = browserRenderCompletionSchema.pick({ outcome: true, diagnostics: true, provenance: true, geometry: true });

export function sanitizeBrowserRenderCompletion(completion: BrowserRenderCompletion): Pick<BrowserRenderCompletion, "outcome" | "diagnostics" | "provenance" | "geometry"> {
  return storedBrowserCompletionSchema.parse({ outcome: completion.outcome, diagnostics: completion.diagnostics, provenance: completion.provenance, ...(completion.geometry ? { geometry: completion.geometry } : {}) });
}

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
    if (completion.outcome === "FAILED") throw new CadDomainError("RENDER_FAILED", "Browser worker failed; retry the same candidate.", { retryable: true });
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
    if (completion.sessionId !== pending.sessionId || completion.token !== pending.token || completion.sourceHash !== pending.sourceHash) {
      throw new BrowserRenderCompletionError("Render completion binding failed.");
    }
    const expected = expectedBrowserProvenance(this.validationPolicyVersion);
    if (JSON.stringify(completion.provenance) !== JSON.stringify(expected)) throw new BrowserRenderCompletionError("Browser renderer provenance does not match the configured pin.");
    clearTimeout(pending.timeout);
    this.pending.delete(jobId);
    pending.resolve(completion);
  }
}

/** Multi-instance coordinator: transient listeners stay local while completion state is shared in PostgreSQL. */
export class PostgresBrowserRenderCoordinator implements CadRenderer {
  private readonly listeners = new Map<string, RequestListener>();

  constructor(
    private readonly validationPolicyVersion: string,
    private readonly pool: Pool,
    private readonly ownerId: string,
    private readonly changes: ProjectChangeSource = new PostgresProjectNotifications(pool),
  ) {}

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
    const deadline = new Date(Date.now() + BROWSER_RENDERER.timeoutMs);
    await this.pool.query(
      `INSERT INTO browser_render_jobs (id, owner_id, project_id, candidate_id, session_id, token_hash, source_hash, state, deadline)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'PENDING',$8)`,
      [jobId, this.ownerId, request.projectId, request.candidateId, listener.sessionId, sha256(token), request.sourceHash, deadline],
    );
    try {
      listener.callback({ jobId, token, purpose: "candidate", candidateId: request.candidateId, source: request.source, sourceHash: request.sourceHash, format: "stl", deadline: deadline.toISOString() });
      return await waitForRenderOutcome<RenderValidationResult>({
        changes: this.changes, ownerId: this.ownerId, jobId, signal: request.signal,
        read: async () => {
          const result = await this.pool.query<{ state: string; completion: unknown; deadline: Date }>("SELECT state, completion, deadline FROM browser_render_jobs WHERE id = $1 AND owner_id = $2", [jobId, this.ownerId]);
          const job = result.rows[0];
          if (!job) throw new Error("Render job is unavailable or expired.");
          if (job.state === "COMPLETED") {
            const completion = storedBrowserCompletionSchema.parse(job.completion);
            if (completion.outcome === "FAILED") throw new CadDomainError("RENDER_FAILED", "Browser worker failed; retry the same candidate.", { retryable: true });
            return { result: { ...completion, outcome: completion.outcome, validationPolicyVersion: this.validationPolicyVersion, artifacts: [] }, deadline: 0 };
          }
          if (job.state !== "PENDING") throw new Error(`Browser rendering ended in ${job.state.toLowerCase()} state.`);
          if (Date.now() >= new Date(job.deadline).getTime()) {
            await this.pool.query("UPDATE browser_render_jobs SET state = 'EXPIRED', updated_at = now() WHERE id = $1 AND owner_id = $2 AND state = 'PENDING'", [jobId, this.ownerId]);
            throw new Error("Browser rendering timed out.");
          }
          return { deadline: new Date(job.deadline).getTime() };
        },
      });
    } catch (error) {
      await this.pool.query("UPDATE browser_render_jobs SET state = 'CANCELLED', updated_at = now() WHERE id = $1 AND owner_id = $2 AND state = 'PENDING'", [jobId, this.ownerId]);
      throw error;
    }
  }

  async complete(jobId: string, raw: unknown): Promise<void> {
    const completion = browserRenderCompletionSchema.parse(raw);
    const storedCompletion = sanitizeBrowserRenderCompletion(completion);
    const expected = expectedBrowserProvenance(this.validationPolicyVersion);
    if (JSON.stringify(completion.provenance) !== JSON.stringify(expected)) throw new BrowserRenderCompletionError("Browser renderer provenance does not match the configured pin.");
    const result = await this.pool.query(
      `UPDATE browser_render_jobs SET state = 'COMPLETED', completion = $1, updated_at = now()
       WHERE id = $2 AND owner_id = $3 AND state = 'PENDING' AND session_id = $4 AND token_hash = $5 AND source_hash = $6 AND deadline > now()
       RETURNING id`,
      [JSON.stringify(storedCompletion), jobId, this.ownerId, completion.sessionId, sha256(completion.token), completion.sourceHash],
    );
    if (!result.rows[0]) throw new BrowserRenderCompletionError("Render completion binding failed or the job is unavailable.");
  }
}
