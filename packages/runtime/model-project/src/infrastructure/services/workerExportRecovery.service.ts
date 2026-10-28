import type { PoolClient } from "pg";
export async function recoverWorkerExports(
  client: PoolClient,
  now: Date,
  ownerId?: string,
): Promise<void> {
  const expired = await client.query<{ export_id: string; owner_id: string }>(
    `UPDATE worker_export_jobs
    SET state='EXPIRED',retain_until=deadline+interval '1 hour',updated_at=$1
    WHERE state='PENDING' AND deadline<=$1 AND ($2::text IS NULL OR owner_id=$2) RETURNING export_id,owner_id`,
    [now, ownerId ?? null],
  );
  for (const row of expired.rows) {
    await client.query(
      `UPDATE model_exports SET state='FAILED',reserved_bytes=0,expires_at=$3,updated_at=$3
      WHERE id=$1 AND owner_id=$2 AND mode='local-worker' AND state='PENDING'`,
      [row.export_id, row.owner_id, now],
    );
  }
  await client.query(
    "DELETE FROM worker_export_jobs WHERE state<>'PENDING' AND retain_until<=$1 AND ($2::text IS NULL OR owner_id=$2)",
    [now, ownerId ?? null],
  );
}
