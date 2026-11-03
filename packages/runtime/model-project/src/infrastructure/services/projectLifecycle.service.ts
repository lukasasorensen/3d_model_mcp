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
    const result = await this.pool.query(
      "UPDATE projects SET is_deleted=true, updated_at=CASE WHEN is_deleted THEN updated_at ELSE now() END WHERE id=$1 AND owner_id=$2 RETURNING id",
      [projectId, this.ownerId],
    );
    if (!result.rows.length)
      throw new CadDomainError("PROJECT_NOT_FOUND", "Project not found.");
  }
}
