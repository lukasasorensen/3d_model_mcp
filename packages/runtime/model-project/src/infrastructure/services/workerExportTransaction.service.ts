import {
  WORKER_EXPORT_LIMITS,
  type WorkerExportCapability,
  type WorkerExportMetadata,
} from "@theoryfoundry/contracts";
import type { PoolClient } from "pg";
import type { ExportRow, WorkerExportJob } from "../../domains/worker/index.js";
import { CadDomainError } from "../../shared/utils/cadDomainError.util.js";
export class WorkerExportTransaction {
  constructor(
    readonly client: PoolClient,
    readonly ownerId: string,
  ) {}

  async activeCount(now: Date): Promise<number> {
    return Number(
      (
        await this.client.query(
          "SELECT count(*) AS count FROM worker_export_jobs WHERE owner_id=$1 AND state='PENDING' AND deadline>$2",
          [this.ownerId, now],
        )
      ).rows[0].count,
    );
  }

  async create(
    row: ExportRow,
    jobId: string,
    tokenHash: string,
  ): Promise<WorkerExportJob> {
    const result = await this.client.query<WorkerExportJob>(
      `INSERT INTO worker_export_jobs
      (id,owner_id,project_id,export_id,revision_id,source_hash,format,token_hash,deadline,retain_until)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [
        jobId,
        this.ownerId,
        row.project_id,
        row.id,
        row.revision_id,
        row.source_hash,
        row.format,
        tokenHash,
        row.deadline,
        new Date(
          new Date(row.deadline).getTime() + WORKER_EXPORT_LIMITS.retentionMs,
        ),
      ],
    );
    return result.rows[0]!;
  }

  async find(
    input: WorkerExportCapability,
    tokenHash: string,
    now: Date,
  ): Promise<WorkerExportJob> {
    const result = await this.client.query<WorkerExportJob>(
      `SELECT j.* FROM worker_export_jobs j
      JOIN projects p ON p.id=j.project_id AND p.owner_id=j.owner_id
      WHERE j.id=$1 AND j.owner_id=$2 AND j.project_id=$3 AND j.export_id=$4 AND j.revision_id=$5
        AND j.source_hash=$6 AND j.format=$7 AND j.token_hash=$8 AND j.retain_until>$9 FOR UPDATE OF j`,
      [
        input.jobId,
        this.ownerId,
        input.projectId,
        input.exportId,
        input.revisionId,
        input.sourceHash,
        input.format,
        tokenHash,
        now,
      ],
    );
    if (!result.rows[0])
      throw new CadDomainError(
        "EXPORT_UNAVAILABLE",
        "Worker export binding is unavailable.",
      );
    return result.rows[0];
  }

  async artifact(
    job: WorkerExportJob,
  ): Promise<(ExportRow & { name: string }) | undefined> {
    return (
      await this.client.query<ExportRow & { name: string }>(
        `SELECT e.*,p.name FROM model_exports e
      JOIN projects p ON p.id=e.project_id AND p.owner_id=e.owner_id
      WHERE e.id=$1 AND e.owner_id=$2 AND e.project_id=$3 AND e.revision_id=$4 AND e.source_hash=$5 AND e.format=$6 FOR UPDATE OF e`,
        [
          job.export_id,
          this.ownerId,
          job.project_id,
          job.revision_id,
          job.source_hash,
          job.format,
        ],
      )
    ).rows[0];
  }

  async finish(
    job: WorkerExportJob,
    state: WorkerExportJob["state"],
    now: Date,
    fingerprint?: string,
    metadata?: WorkerExportMetadata,
  ): Promise<WorkerExportJob> {
    const result = await this.client.query<WorkerExportJob>(
      `UPDATE worker_export_jobs SET state=$3,completion_hash=$4,
      completion=$5,retain_until=$6,updated_at=$7 WHERE id=$1 AND owner_id=$2 AND state='PENDING' RETURNING *`,
      [
        job.id,
        this.ownerId,
        state,
        fingerprint ?? null,
        metadata ? JSON.stringify(metadata) : null,
        new Date(now.getTime() + WORKER_EXPORT_LIMITS.retentionMs),
        now,
      ],
    );
    if (!result.rows[0])
      throw new CadDomainError(
        "EXPORT_UNAVAILABLE",
        "Worker export is no longer pending.",
      );
    if (state !== "COMPLETED") {
      await this.client.query(
        `UPDATE model_exports SET state='FAILED',reserved_bytes=0,expires_at=$3,updated_at=$3
        WHERE id=$1 AND owner_id=$2 AND mode='local-worker' AND state='PENDING'`,
        [job.export_id, this.ownerId, now],
      );
    }
    return result.rows[0];
  }
}
