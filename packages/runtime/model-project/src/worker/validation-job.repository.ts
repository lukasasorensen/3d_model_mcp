import type { Pool, PoolClient } from "pg";
import { PostgresProjectPersistence } from "../postgres-project-persistence.js";
import { CadDomainError } from "../cad-domain-error.js";

export interface WorkerValidationJob {
  id: string; project_id: string; candidate_id: string; attempt_id: string; source_hash: string;
  state: "PENDING" | "COMPLETED" | "CANCELLED" | "EXPIRED"; deadline: Date;
  completion_hash: string | null; completion: unknown;
}

/** One owner lock serializes admission and capability operations across replicas. */
export class WorkerValidationTransaction {
  readonly candidates: PostgresProjectPersistence;
  constructor(pool: Pool, private readonly client: PoolClient, private readonly ownerId: string) {
    this.candidates = new PostgresProjectPersistence(pool, ownerId, client);
  }
  async lockOwner() {
    const result = await this.client.query('SELECT id FROM "user" WHERE id=$1 FOR UPDATE', [this.ownerId]);
    if (!result.rows[0]) throw new CadDomainError("PROJECT_NOT_FOUND", "Project not found.");
  }
  async expired(now: Date): Promise<WorkerValidationJob[]> {
    return (await this.client.query<WorkerValidationJob>("SELECT * FROM worker_validation_jobs WHERE owner_id=$1 AND state='PENDING' AND deadline<=$2 FOR UPDATE", [this.ownerId, now])).rows;
  }
  async activeCount() {
    return Number((await this.client.query("SELECT count(*) AS count FROM worker_validation_jobs WHERE owner_id=$1 AND state='PENDING'", [this.ownerId])).rows[0].count);
  }
  async create(input: { id: string; projectId: string; candidateId: string; attemptId: string; sourceHash: string; tokenHash: string; deadline: Date }) {
    await this.client.query(`INSERT INTO worker_validation_jobs (id,owner_id,project_id,candidate_id,attempt_id,source_hash,token_hash,deadline)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`, [input.id, this.ownerId, input.projectId, input.candidateId, input.attemptId, input.sourceHash, input.tokenHash, input.deadline]);
  }
  async find(input: { jobId: string; projectId: string; candidateId: string }, tokenHash: string): Promise<WorkerValidationJob> {
    const result = await this.client.query<WorkerValidationJob>(`SELECT j.* FROM worker_validation_jobs j
      JOIN projects p ON p.id=j.project_id AND p.owner_id=j.owner_id
      JOIN candidates c ON c.id=j.candidate_id AND c.project_id=p.id
      WHERE j.id=$1 AND j.owner_id=$2 AND j.project_id=$3 AND j.candidate_id=$4 AND j.token_hash=$5 FOR UPDATE OF j`,
    [input.jobId, this.ownerId, input.projectId, input.candidateId, tokenHash]);
    if (!result.rows[0]) throw new CadDomainError("CANDIDATE_NOT_FOUND", "Validation job not found.");
    return result.rows[0];
  }
  async finish(id: string, state: WorkerValidationJob["state"], now: Date, completionHash?: string, completion?: unknown) {
    await this.client.query(`UPDATE worker_validation_jobs SET state=$3,completion_hash=$4,completion=$5,updated_at=$6
      WHERE id=$1 AND owner_id=$2 AND state='PENDING'`, [id, this.ownerId, state, completionHash ?? null, completion ? JSON.stringify(completion) : null, now]);
  }
}

export class WorkerValidationJobsRepository {
  constructor(private readonly pool: Pool, private readonly ownerId: string) {}
  async transaction<T>(operation: (transaction: WorkerValidationTransaction) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const transaction = new WorkerValidationTransaction(this.pool, client, this.ownerId);
      await transaction.lockOwner();
      const result = await operation(transaction);
      await client.query("COMMIT"); return result;
    } catch (error) { await client.query("ROLLBACK").catch(() => undefined); throw error; }
    finally { client.release(); }
  }
}
