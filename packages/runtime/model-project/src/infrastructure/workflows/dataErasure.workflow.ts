import { rm } from "node:fs/promises";
import { join } from "node:path";
import type { Pool, PoolClient } from "pg";
import { CadDomainError } from "../../shared/utils/cadDomainError.util.js";
import type { ErasureTarget } from "../erasure.types.js";
import type { ErasureJournal } from "../services/erasureJournal.service.js";

export class DataErasureWorkflow {
  constructor(
    private readonly pool: Pool,
    private readonly journal: ErasureJournal,
    private readonly exports: string,
  ) {}

  async erase(target: ErasureTarget): Promise<void> {
    const { ownerId, projectId } = target;
    const client = await this.pool.connect();
    let files: string[];
    try {
      await client.query("BEGIN");
      // The owner lock also conflicts with inserts referencing this user.
      const owner = (
        await client.query<{ email: string }>(
          'SELECT email FROM "user" WHERE id=$1 FOR UPDATE',
          [ownerId],
        )
      ).rows[0];
      const projects = await client.query<{ id: string }>(
        "SELECT id FROM projects WHERE owner_id=$1 AND ($2::text IS NULL OR id=$2) ORDER BY id FOR UPDATE",
        [ownerId, projectId],
      );
      const previous = await this.journal.find(target);
      if (projectId !== null && !projects.rows.length && !previous)
        throw new CadDomainError("PROJECT_NOT_FOUND", "Project not found.");
      if (!owner && !previous) throw new Error("Account not found.");
      const ids = projects.rows.map((row) => row.id);
      const exports = await client.query<{ id: string }>(
        "SELECT id FROM model_exports WHERE owner_id=$1 AND project_id=ANY($2::text[]) FOR UPDATE",
        [ownerId, ids],
      );
      files = [
        ...new Set([
          ...(previous?.exportIds ?? []),
          ...exports.rows.map((row) => row.id),
        ]),
      ];
      const invitations = new Set(previous?.invitationIds);
      if (projectId === null && owner) {
        const removed = await client.query<{ id: string }>(
          "DELETE FROM platform_invitation WHERE created_by=$1 OR lower(email)=lower($2) RETURNING id",
          [ownerId, owner.email],
        );
        for (const row of removed.rows) invitations.add(row.id);
      }
      if (projectId === null) {
        // A backup may predate invitation redemption and creation of the user.
        await client.query(
          "DELETE FROM platform_invitation WHERE id=ANY($1::text[])",
          [[...invitations]],
        );
        await client.query(
          "DELETE FROM verification WHERE value=$1 OR (CASE WHEN value IS JSON OBJECT THEN value::jsonb->>'userId' END)=$1",
          [ownerId],
        );
      }
      await this.removeProjects(client, ownerId, ids);
      if (projectId === null)
        await client.query('DELETE FROM "user" WHERE id=$1', [ownerId]);
      // Record authorized intent independently of both rollback domains before commit.
      await this.journal.save({
        ...target,
        exportIds: files,
        invitationIds: [...invitations],
      });
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
    for (const id of files) await rm(join(this.exports, id), { force: true });
  }

  private async removeProjects(
    client: PoolClient,
    ownerId: string,
    ids: string[],
  ): Promise<void> {
    if (!ids.length) return;
    await client.query(
      "UPDATE projects SET is_deleted=true,current_revision_id=NULL WHERE owner_id=$1 AND id=ANY($2::text[])",
      [ownerId, ids],
    );
    await client.query(
      "DELETE FROM candidates WHERE project_id=ANY($1::text[])",
      [ids],
    );
    // Remove self-referencing history together before cascading the other project data.
    await client.query(
      "DELETE FROM revisions WHERE project_id=ANY($1::text[])",
      [ids],
    );
    await client.query(
      "DELETE FROM projects WHERE owner_id=$1 AND id=ANY($2::text[])",
      [ownerId, ids],
    );
  }

  async replay(): Promise<void> {
    for await (const record of this.journal.records()) await this.erase(record);
    const legacy = await this.pool.query<{ id: string; owner_id: string }>(
      "SELECT id,owner_id FROM projects WHERE is_deleted",
    );
    for (const row of legacy.rows)
      await this.erase({ ownerId: row.owner_id, projectId: row.id });
  }
}
