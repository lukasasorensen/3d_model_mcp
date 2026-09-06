import { randomBytes } from "node:crypto";
import type { Pool } from "pg";
import { previewJobSchema, previewCompletionSchema, type PreviewMetadata, type PreviewJob } from "@rjls/contracts";
import { CadDomainError } from "./cad-domain-error.js";
import { sha256 } from "./hash.js";

type PreviewBinding = Omit<PreviewMetadata, "imageHash">;
export interface PersistedPreviewJob { id: string; metadata: PreviewBinding; source: string; state: string; completion: { png?: string; error?: string } | null; deadline: Date; claim_deadline: Date; claimed_at: Date | null }
export class BrowserPreviewJobsRepository {
  constructor(private readonly pool: Pool, readonly ownerId: string) {}
  async sweep(): Promise<void> {
    await this.pool.query("DELETE FROM browser_preview_jobs WHERE owner_id = $1 AND (deadline <= now() OR (claimed_at IS NULL AND claim_deadline <= now()))", [this.ownerId]);
  }
  async enqueue(id: string, metadata: PreviewBinding, source: string, mode: "local-mcp" | "remote-mcp"): Promise<void> {
    await this.sweep();
    try {
      const result = await this.pool.query(`INSERT INTO browser_preview_jobs (id, owner_id, project_id, metadata, source, delivery_mode, claim_deadline, deadline)
        SELECT $1, $2, id, $4::jsonb, $5, $6, now() + interval '15 seconds', now() + interval '80 seconds' FROM projects WHERE id = $3 AND owner_id = $2 RETURNING id`,
      [id, this.ownerId, metadata.projectId, JSON.stringify(metadata), source, mode]);
      if (!result.rows.length) throw new CadDomainError("PROJECT_NOT_FOUND", "Project not found.");
    } catch (error) {
      if ((error as { code?: string; constraint?: string }).code === "23505" && (error as { constraint?: string }).constraint === "browser_preview_jobs_active_idx") throw new CadDomainError("BROWSER_BUSY", "A preview is already running for this project. Retry after it finishes.");
      throw error;
    }
  }
  async claim(projectId: string, sessionId: string, modes: string[]): Promise<PreviewJob | undefined> {
    const result = await this.pool.query<PersistedPreviewJob>(`UPDATE browser_preview_jobs SET session_id = $3, claimed_at = now(), updated_at = now()
      WHERE id = (SELECT j.id FROM browser_preview_jobs j JOIN projects p ON p.id = j.project_id AND p.owner_id = j.owner_id
        WHERE j.owner_id = $1 AND j.project_id = $2 AND j.delivery_mode::text = ANY($4::text[]) AND j.state = 'PENDING'
        AND j.claimed_at IS NULL AND j.claim_deadline > now() AND j.deadline > now() FOR UPDATE OF j SKIP LOCKED LIMIT 1)
      AND owner_id = $1 RETURNING *`, [this.ownerId, projectId, sessionId, modes]);
    const job = result.rows[0];
    if (!job) return undefined;
    const token = randomBytes(32).toString("hex");
    // The job is exclusively claimed; a failed token write leaves it to expire.
    await this.pool.query("UPDATE browser_preview_jobs SET token_hash = $3 WHERE id = $1 AND owner_id = $2", [job.id, this.ownerId, sha256(token)]);
    return previewJobSchema.parse({ ...job.metadata, jobId: job.id, source: job.source, deadline: new Date(job.deadline).toISOString(), token });
  }
  async browserStatus(projectId: string, sessionId: string, jobId: string, token: string): Promise<"pending" | "completed" | "cancelled"> {
    const result = await this.pool.query<{ state: string }>(`SELECT j.state FROM browser_preview_jobs j
      JOIN projects p ON p.id = j.project_id AND p.owner_id = j.owner_id
      WHERE j.id = $1 AND j.owner_id = $2 AND j.project_id = $3 AND j.session_id = $4 AND j.token_hash = $5
      AND j.deadline > now()`, [jobId, this.ownerId, projectId, sessionId, sha256(token)]);
    const state = result.rows[0]?.state;
    return state === "PENDING" ? "pending" : state === "COMPLETED" ? "completed" : "cancelled";
  }
  async outcome(id: string): Promise<PersistedPreviewJob | undefined> {
    return (await this.pool.query<PersistedPreviewJob>("SELECT j.* FROM browser_preview_jobs j JOIN projects p ON p.id = j.project_id AND p.owner_id = j.owner_id WHERE j.id = $1 AND j.owner_id = $2", [id, this.ownerId])).rows[0];
  }
  async complete(raw: unknown): Promise<void> {
    const completion = previewCompletionSchema.parse(raw);
    const { jobId, token, sessionId, provenance: _provenance, png, error, ...metadata } = completion;
    void _provenance;
    const result = await this.pool.query(`UPDATE browser_preview_jobs j SET completion = $5::jsonb, state = 'COMPLETED', updated_at = now()
      WHERE j.id = $1 AND j.owner_id = $2 AND j.session_id = $3 AND j.token_hash = $4 AND j.metadata = $6::jsonb
      AND j.state = 'PENDING' AND j.claimed_at IS NOT NULL AND j.deadline > now()
      AND EXISTS (SELECT 1 FROM projects p WHERE p.id = j.project_id AND p.owner_id = $2) RETURNING j.id`,
    [jobId, this.ownerId, sessionId, sha256(token), JSON.stringify({ png, error }), JSON.stringify(metadata)]);
    if (!result.rows.length) throw new CadDomainError("INVALID_PREVIEW", "Preview completion binding failed or expired.");
  }
  async remove(id: string): Promise<void> { await this.pool.query("DELETE FROM browser_preview_jobs WHERE id = $1 AND owner_id = $2", [id, this.ownerId]); }
}
