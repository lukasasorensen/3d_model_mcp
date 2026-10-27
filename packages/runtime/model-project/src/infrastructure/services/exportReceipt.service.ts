import {
  exportMetadataSchema,
  type ExportReceipt,
} from "@theoryfoundry/contracts";
import { randomBytes } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import type { ExportRow } from "../../domains/worker/index.js";
import { CadDomainError } from "../../shared/utils/cadDomainError.util.js";
import { sha256 } from "../../shared/utils/hash.util.js";

export async function issueExportReceipt(
  executor: Pool | PoolClient,
  ownerId: string,
  row: ExportRow,
  origin: string,
  now = new Date(),
): Promise<ExportReceipt> {
  const metadata = exportMetadataSchema.parse(row.metadata);
  const token = randomBytes(32).toString("hex");
  const expiry = new Date(
    Math.min(now.getTime() + 600_000, new Date(row.expires_at).getTime()),
  );
  const result = await executor.query(
    `INSERT INTO export_download_tokens (hash,export_id,expires_at)
    SELECT $1,e.id,$3 FROM model_exports e JOIN projects p ON p.id=e.project_id AND p.owner_id=e.owner_id
    WHERE e.id=$2 AND e.owner_id=$4 AND e.state='READY' AND e.expires_at>$5 RETURNING export_id`,
    [sha256(token), row.id, expiry, ownerId, now],
  );
  if (!result.rows[0])
    throw new CadDomainError(
      "EXPORT_UNAVAILABLE",
      "Export is unavailable or expired.",
    );
  return {
    ...metadata,
    downloadUrl: `${origin}/v1/exports/${row.id}/download?token=${token}`,
    downloadExpiresAt: expiry.toISOString(),
  };
}
