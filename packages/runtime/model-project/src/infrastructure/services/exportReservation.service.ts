import { CAD_LIMITS } from "@theoryfoundry/contracts";
import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import type { ExportRow } from "../../domains/worker/index.js";
import { CadDomainError } from "../../shared/utils/cadDomainError.util.js";
import { sha256 } from "../../shared/utils/hash.util.js";

/** Shared lock order: global quota, project, export/job rows. Never acquire quota after a row lock. */
export async function lockExportCapacity(client: PoolClient) {
  await client.query("SELECT pg_advisory_xact_lock(820461)");
}

export async function reserveExport(
  client: PoolClient,
  ownerId: string,
  input: {
    projectId: string;
    revision: string;
    format: "stl" | "3mf";
    mode: string;
  },
  now: Date,
  leaseMs = 90_000,
): Promise<{ row: ExportRow; created: boolean; source: string }> {
  await lockExportCapacity(client);
  const target = await client.query(
    `SELECT r.source,r.source_hash FROM projects p
    JOIN revisions r ON r.id=p.current_revision_id AND r.project_id=p.id
    WHERE p.id=$1 AND p.owner_id=$2 AND r.id=$3 FOR UPDATE OF p`,
    [input.projectId, ownerId, input.revision],
  );
  if (!target.rows[0])
    throw new CadDomainError(
      "STALE_REVISION",
      "Export requires the current owned revision.",
    );
  const source: string = target.rows[0].source;
  if (
    Buffer.byteLength(source) > CAD_LIMITS.sourceBytes ||
    sha256(source) !== target.rows[0].source_hash
  ) {
    throw new CadDomainError(
      "CORRUPT_PROJECT",
      "Export source integrity failed.",
    );
  }
  const existing = await client.query<ExportRow>(
    `SELECT * FROM model_exports
    WHERE owner_id=$1 AND project_id=$2 AND revision_id=$3 AND format=$4 AND
      ((state='READY' AND expires_at>$6) OR (state='PENDING' AND deadline>$6 AND mode=$5))
    ORDER BY (state='READY') DESC,created_at DESC LIMIT 1`,
    [ownerId, input.projectId, input.revision, input.format, input.mode, now],
  );
  if (existing.rows[0])
    return { row: existing.rows[0], created: false, source };
  const limit =
    input.format === "stl" ? CAD_LIMITS.previewBytes : CAD_LIMITS.exportBytes;
  const usage = await client.query(
    `SELECT COALESCE(sum(reserved_bytes),0) AS total,
    COALESCE(sum(CASE WHEN owner_id=$1 THEN reserved_bytes ELSE 0 END),0) AS owned FROM model_exports
    WHERE (state='READY' AND expires_at>$2) OR (state='PENDING' AND deadline>$2)`,
    [ownerId, now],
  );
  if (
    Number(usage.rows[0].total) + limit > 2 * 1024 ** 3 ||
    Number(usage.rows[0].owned) + limit > 250 * 1024 ** 2
  ) {
    throw new CadDomainError(
      "EXPORT_CAPACITY",
      "Temporary export capacity is full; retry after expiry.",
      { retryable: true },
    );
  }
  const result = await client.query<ExportRow>(
    `INSERT INTO model_exports
    (id,owner_id,project_id,revision_id,source_hash,format,mode,state,reserved_bytes,deadline,expires_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,'PENDING',$8,$9,$10) RETURNING *`,
    [
      randomUUID(),
      ownerId,
      input.projectId,
      input.revision,
      target.rows[0].source_hash,
      input.format,
      input.mode,
      limit,
      new Date(now.getTime() + leaseMs),
      new Date(now.getTime() + 3_600_000),
    ],
  );
  const row = result.rows[0]!;
  await client.query("SELECT pg_notify('theoryfoundry_changes',$1)", [
    JSON.stringify({
      kind: "render",
      ownerId,
      projectId: input.projectId,
      jobId: row.id,
    }),
  ]);
  return { row, created: true, source };
}
