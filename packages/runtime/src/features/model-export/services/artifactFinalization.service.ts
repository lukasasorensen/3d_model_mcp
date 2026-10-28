import {
  CAD_LIMITS,
  exportFilename,
  exportMetadataSchema,
} from "@theoryfoundry/contracts";
import {
  CadDomainError,
  sha256,
  type ExportRow,
} from "@theoryfoundry/model-project";
import { parseBinaryStl, parseThreeMf } from "@theoryfoundry/renderer";
import type { PoolClient } from "pg";
import type { ExportFileStore } from "../exportFileStore.port.js";
/** Shared browser/worker artifact rules. Caller holds the bound pending export row lock. */
export class ExportArtifactFinalizationService {
  constructor(private readonly files: ExportFileStore) {}

  async finalize(
    client: PoolClient,
    row: ExportRow & { name: string },
    bytes: Uint8Array,
    now: Date,
  ): Promise<ReturnType<typeof exportMetadataSchema.parse>> {
    if (
      !bytes.byteLength ||
      bytes.byteLength >
        (row.format === "stl"
          ? CAD_LIMITS.previewBytes
          : CAD_LIMITS.exportBytes)
    ) {
      throw new CadDomainError(
        "ARTIFACT_LIMIT_EXCEEDED",
        "Export exceeds byte limit.",
      );
    }
    try {
      if (row.format === "stl") parseBinaryStl(bytes);
      else parseThreeMf(bytes);
    } catch {
      throw new CadDomainError(
        "EXPORT_UNAVAILABLE",
        "Generated export has invalid geometry or format.",
      );
    }
    const hash = sha256(bytes),
      expiresAt = new Date(now.getTime() + 3_600_000);
    const metadata = exportMetadataSchema.parse({
      exportId: row.id,
      projectId: row.project_id,
      revision: row.revision_id,
      sourceHash: row.source_hash,
      format: row.format,
      mimeType: row.format === "stl" ? "model/stl" : "model/3mf",
      filename: exportFilename(
        row.name,
        row.project_id,
        row.revision_id,
        hash,
        row.format,
      ),
      hash,
      byteSize: bytes.byteLength,
      expiresAt: expiresAt.toISOString(),
    });
    await this.files.put(row.id, bytes);
    await client.query(
      `UPDATE model_exports SET state='READY',metadata=$2,reserved_bytes=$3,expires_at=$4,
      token_hash=NULL,updated_at=$6 WHERE id=$1 AND owner_id=$5`,
      [
        row.id,
        JSON.stringify(metadata),
        bytes.byteLength,
        expiresAt,
        row.owner_id,
        now,
      ],
    );
    await client.query("SELECT pg_notify('theoryfoundry_changes',$1)", [
      JSON.stringify({
        kind: "render",
        ownerId: row.owner_id,
        projectId: row.project_id,
        jobId: row.id,
      }),
    ]);
    return metadata;
  }
}
