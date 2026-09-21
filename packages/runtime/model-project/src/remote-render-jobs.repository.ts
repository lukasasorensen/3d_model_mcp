import type { Pool } from "pg";
import type { BrowserRenderCompletion, CandidateRenderRequest } from "@rjls/contracts";

export interface RemoteRenderJob {
  createdAt: string; jobId: string; candidateId: string; source: string; sourceHash: string; deadline: string;
}
export interface PersistedRenderOutcome {
  deadline: Date; claim_deadline: Date | null; claimed_at: Date | null;
  state: string; completion: Pick<BrowserRenderCompletion, "outcome" | "diagnostics" | "provenance" | "geometry"> | null;
}

/** All job access is scoped to an authenticated owner, including recovery. */
export class RemoteRenderJobsRepository {
  constructor(private readonly pool: Pool, readonly ownerId: string, readonly deliveryMode: "remote-mcp" | "local-mcp" = "remote-mcp") {}

  async enqueue(id: string, request: CandidateRenderRequest): Promise<void> {
    const result = await this.pool.query(
      `INSERT INTO browser_render_jobs (id, owner_id, project_id, candidate_id, source_hash, delivery_mode, claim_deadline, deadline)
       SELECT $1, $2, c.project_id, c.id, c.source_hash, '${this.deliveryMode}', now() + interval '${this.deliveryMode === 'local-mcp' ? 60 : 15} seconds', now() + interval '${this.deliveryMode === 'local-mcp' ? 60 : 90} seconds'
       FROM candidates c JOIN projects p ON p.id = c.project_id
       WHERE c.id = $3 AND p.id = $4 AND p.owner_id = $2 AND c.source_hash = $5 AND c.state = 'RUNNING'
       RETURNING id`, [id, this.ownerId, request.candidateId, request.projectId, request.sourceHash]);
    if (!result.rows[0]) throw new Error("Cannot enqueue an unavailable candidate.");
  }

  async claim(projectId: string, sessionId: string, tokenHash: string): Promise<RemoteRenderJob | undefined> {
    await this.recover();
    const result = await this.pool.query<{ id: string; candidate_id: string; source: string; source_hash: string; deadline: Date; created_at: Date }>(
      `WITH next_job AS (
         SELECT j.id FROM browser_render_jobs j JOIN projects p ON p.id = j.project_id
         JOIN candidates c ON c.id = j.candidate_id AND c.project_id = p.id
         WHERE j.owner_id = $1 AND p.owner_id = $1 AND j.project_id = $2 AND j.delivery_mode = '${this.deliveryMode}'
           AND j.state = 'PENDING' AND j.claimed_at IS NULL AND j.claim_deadline > now() AND j.deadline > now()
           AND c.state = 'RUNNING' AND c.source_hash = j.source_hash
         ORDER BY j.created_at FOR UPDATE OF j SKIP LOCKED LIMIT 1
       ), claimed AS (
         UPDATE browser_render_jobs j SET session_id = $3, token_hash = $4, claimed_at = now(),
           deadline = LEAST(j.deadline, now() + interval '65 seconds'), updated_at = now()
         FROM next_job WHERE j.id = next_job.id AND j.owner_id = $1 RETURNING j.*
       ) SELECT claimed.id, claimed.candidate_id, c.source, claimed.source_hash, claimed.deadline, claimed.created_at
         FROM claimed JOIN candidates c ON c.id = claimed.candidate_id AND c.project_id = claimed.project_id`,
      [this.ownerId, projectId, sessionId, tokenHash]);
    const job = result.rows[0];
    return job ? { createdAt: new Date(job.created_at).toISOString(), jobId: job.id, candidateId: job.candidate_id, source: job.source, sourceHash: job.source_hash, deadline: new Date(job.deadline).toISOString() } : undefined;
  }

  async outcome(id: string): Promise<PersistedRenderOutcome | undefined> {
    await this.expire();
    const result = await this.pool.query<PersistedRenderOutcome>(`SELECT state, completion, deadline, claim_deadline, claimed_at FROM browser_render_jobs WHERE id = $1 AND owner_id = $2 AND delivery_mode = '${this.deliveryMode}'`, [id, this.ownerId]);
    return result.rows[0];
  }

  async cancel(id: string): Promise<void> {
    await this.pool.query(`UPDATE browser_render_jobs SET state = 'CANCELLED', updated_at = now() WHERE id = $1 AND owner_id = $2 AND delivery_mode = '${this.deliveryMode}' AND state = 'PENDING'`, [id, this.ownerId]);
  }

  private async expire(): Promise<void> {
    await this.pool.query(`UPDATE browser_render_jobs SET state = 'EXPIRED', updated_at = now()
      WHERE owner_id = $1 AND delivery_mode = '${this.deliveryMode}' AND state = 'PENDING'
        AND (deadline <= now() OR (claimed_at IS NULL AND claim_deadline <= now()))`, [this.ownerId]);
  }

  async recover(): Promise<void> {
    await this.expire();
    await this.pool.query(`WITH expired AS (
      UPDATE candidates c SET state='CREATED',active_attempt_id=NULL,updated_at=now()
      FROM validation_attempts a,projects p WHERE c.project_id=p.id AND p.owner_id=$1 AND c.state='RUNNING'
      AND c.active_attempt_id=a.id AND a.deadline<=now() RETURNING a.id
    ) UPDATE validation_attempts SET state='FAILED',error='{"code":"RENDER_FAILED","message":"Validation interrupted; retry the same candidate.","details":{"retryable":true}}'::jsonb,updated_at=now() WHERE id IN (SELECT id FROM expired)`, [this.ownerId]);
    await this.pool.query(`UPDATE candidates c SET state='CREATED',updated_at=now() FROM projects p
      WHERE c.project_id=p.id AND p.owner_id=$1 AND c.state='RUNNING' AND c.active_attempt_id IS NULL
      AND c.updated_at<now()-interval '120 seconds'
      AND NOT EXISTS (SELECT 1 FROM browser_render_jobs j WHERE j.candidate_id=c.id AND j.owner_id=$1 AND j.state='PENDING' AND j.deadline>now())`,[this.ownerId]);
    await this.pool.query(`DELETE FROM browser_render_jobs WHERE owner_id = $1 AND delivery_mode = '${this.deliveryMode}' AND state <> 'PENDING' AND updated_at < now() - interval '1 day'`, [this.ownerId]);
  }
}
