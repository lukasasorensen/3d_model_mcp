import {
  BROWSER_RENDERER,
  browserRenderCompletionSchema,
  type CadRenderer,
  type CandidateRenderRequest,
  type RenderValidationResult,
} from "@theoryfoundry/contracts";
import {
  CadDomainError,
  sha256,
  type ProjectChangeSource,
} from "@theoryfoundry/model-project";
import { randomBytes } from "node:crypto";
import type { Pool } from "pg";
import type {
  BrowserRenderRequest,
  RequestListener,
} from "../browserRender.types.js";
import { waitForRenderOutcome } from "../services/renderOutcome.service.js";
import {
  BrowserRenderCompletionError,
  expectedBrowserProvenance,
  opaqueRandomId,
  sanitizeBrowserRenderCompletion,
  storedBrowserCompletionSchema,
} from "../utils/browserProvenance.util.js";
/** Multi-instance coordinator: transient listeners stay local while completion state is shared in PostgreSQL. */
export class PostgresBrowserRenderAdapter implements CadRenderer {
  private readonly listeners = new Map<string, RequestListener>();

  constructor(
    private readonly validationPolicyVersion: string,
    private readonly pool: Pool,
    private readonly ownerId: string,
    private readonly changes: ProjectChangeSource,
  ) {}

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
    const deadline = new Date(Date.now() + BROWSER_RENDERER.timeoutMs);
    await this.pool.query(
      `INSERT INTO browser_render_jobs (id, owner_id, project_id, candidate_id, session_id, token_hash, source_hash, state, deadline)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'PENDING',$8)`,
      [
        jobId,
        this.ownerId,
        request.projectId,
        request.candidateId,
        listener.sessionId,
        sha256(token),
        request.sourceHash,
        deadline,
      ],
    );
    try {
      listener.callback({
        jobId,
        token,
        purpose: "candidate",
        candidateId: request.candidateId,
        source: request.source,
        sourceHash: request.sourceHash,
        format: "stl",
        deadline: deadline.toISOString(),
      });
      return await waitForRenderOutcome<RenderValidationResult>({
        changes: this.changes,
        ownerId: this.ownerId,
        jobId,
        signal: request.signal,
        read: async () => {
          const result = await this.pool.query<{
            state: string;
            completion: unknown;
            deadline: Date;
          }>(
            "SELECT state, completion, deadline FROM browser_render_jobs WHERE id = $1 AND owner_id = $2",
            [jobId, this.ownerId],
          );
          const job = result.rows[0];
          if (!job) throw new Error("Render job is unavailable or expired.");
          if (job.state === "COMPLETED") {
            const completion = storedBrowserCompletionSchema.parse(
              job.completion,
            );
            if (completion.outcome === "FAILED")
              throw new CadDomainError(
                "RENDER_FAILED",
                "Browser worker failed; retry the same candidate.",
                { retryable: true },
              );
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
          if (job.state !== "PENDING")
            throw new Error(
              `Browser rendering ended in ${job.state.toLowerCase()} state.`,
            );
          if (Date.now() >= new Date(job.deadline).getTime()) {
            await this.pool.query(
              "UPDATE browser_render_jobs SET state = 'EXPIRED', updated_at = now() WHERE id = $1 AND owner_id = $2 AND state = 'PENDING'",
              [jobId, this.ownerId],
            );
            throw new Error("Browser rendering timed out.");
          }
          return { deadline: new Date(job.deadline).getTime() };
        },
      });
    } catch (error) {
      await this.pool.query(
        "UPDATE browser_render_jobs SET state = 'CANCELLED', updated_at = now() WHERE id = $1 AND owner_id = $2 AND state = 'PENDING'",
        [jobId, this.ownerId],
      );
      throw error;
    }
  }

  async complete(jobId: string, raw: unknown): Promise<void> {
    const completion = browserRenderCompletionSchema.parse(raw);
    const storedCompletion = sanitizeBrowserRenderCompletion(completion);
    const expected = expectedBrowserProvenance(this.validationPolicyVersion);
    if (JSON.stringify(completion.provenance) !== JSON.stringify(expected))
      throw new BrowserRenderCompletionError(
        "Browser renderer provenance does not match the configured pin.",
      );
    const result = await this.pool.query(
      `UPDATE browser_render_jobs SET state = 'COMPLETED', completion = $1, updated_at = now()
       WHERE id = $2 AND owner_id = $3 AND state = 'PENDING' AND session_id = $4 AND token_hash = $5 AND source_hash = $6 AND deadline > now()
       RETURNING id`,
      [
        JSON.stringify(storedCompletion),
        jobId,
        this.ownerId,
        completion.sessionId,
        sha256(completion.token),
        completion.sourceHash,
      ],
    );
    if (!result.rows[0])
      throw new BrowserRenderCompletionError(
        "Render completion binding failed or the job is unavailable.",
      );
  }
}
