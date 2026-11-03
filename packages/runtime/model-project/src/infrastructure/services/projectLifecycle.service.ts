import type { Pool } from "pg";
import { CadDomainError } from "../../shared/utils/cadDomainError.util.js";

export class ProjectLifecycleService {
  constructor(
    private readonly pool: Pool,
    private readonly ownerId: string,
  ) {}

  async setProjectArchived(
    projectId: string,
    isArchived: boolean,
  ): Promise<void> {
    const result = await this.pool.query(
      "UPDATE projects SET is_archived=$3, updated_at=now() WHERE id=$1 AND owner_id=$2 AND NOT is_deleted RETURNING id",
      [projectId, this.ownerId, isArchived],
    );
    if (!result.rows.length)
      throw new CadDomainError("PROJECT_NOT_FOUND", "Project not found.");
  }

  async deleteProject(projectId: string): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      // Worker validation takes the owner lock before project and lease locks.
      await client.query(
        'SELECT id FROM "user" WHERE id=$1 FOR NO KEY UPDATE',
        [this.ownerId],
      );
      const result = await client.query(
        "UPDATE projects SET is_deleted=true, updated_at=CASE WHEN is_deleted THEN updated_at ELSE now() END WHERE id=$1 AND owner_id=$2 RETURNING id",
        [projectId, this.ownerId],
      );
      if (!result.rows.length)
        throw new CadDomainError("PROJECT_NOT_FOUND", "Project not found.");
      await client.query(
        "UPDATE worker_validation_jobs SET state='CANCELLED',updated_at=now() WHERE owner_id=$1 AND project_id=$2 AND state='PENDING'",
        [this.ownerId, projectId],
      );
      await client.query(
        `UPDATE validation_attempts SET state='FAILED',error=$2,updated_at=now()
         WHERE state='RUNNING' AND candidate_id IN (SELECT id FROM candidates WHERE project_id=$1)`,
        [
          projectId,
          JSON.stringify({
            code: "CANCELLED",
            message: "Project deleted.",
            details: {},
          }),
        ],
      );
      await client.query(
        "UPDATE candidates SET state='CREATED',active_attempt_id=NULL,updated_at=now() WHERE project_id=$1 AND state='RUNNING'",
        [projectId],
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }
}
