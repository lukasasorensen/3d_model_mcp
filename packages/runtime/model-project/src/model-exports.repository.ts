import { randomBytes } from "node:crypto";
import type { Pool } from "pg";
import { exportMetadataSchema, type ExportReceipt } from "@theoryfoundry/contracts";
import { CadDomainError } from "./cad-domain-error.js";
import { sha256 } from "./hash.js";
import { lockExportCapacity, reserveExport } from "./exports/export-reservation.repository.js";
import { issueExportReceipt } from "./exports/export-receipt.repository.js";
export interface ExportRow {
    id: string;
    owner_id: string;
    project_id: string;
    revision_id: string;
    source_hash: string;
    format: "stl" | "3mf";
    mode: string;
    state: string;
    session_id: string | null;
    token_hash: string | null;
    metadata: unknown;
    deadline: Date;
    expires_at: Date;
}
export class ModelExportsRepository {
    constructor(readonly pool: Pool, readonly ownerId: string) { }
    async list(projectId: string) {
        const result = await this.pool.query("SELECT e.metadata FROM model_exports e JOIN projects p ON p.id=e.project_id AND p.owner_id=e.owner_id WHERE e.owner_id=$1 AND e.project_id=$2 AND e.state='READY' AND e.expires_at>now()", [this.ownerId, projectId]);
        return result.rows.map(r => exportMetadataSchema.parse(r.metadata));
    }
    async accept(projectId: string, revision: string, format: "stl" | "3mf", mode: string): Promise<ExportRow> {
        const client = await this.pool.connect();
        try {
            await client.query("BEGIN");
            await lockExportCapacity(client);
            const { row } = await reserveExport(client, this.ownerId, { projectId, revision, format, mode }, new Date());
            await client.query("COMMIT");
            return row;
        }
        catch (error) {
            await client.query("ROLLBACK");
            throw error;
        }
        finally {
            client.release();
        }
    }
    async get(id: string): Promise<ExportRow> {
        const result = await this.pool.query<ExportRow>("SELECT e.* FROM model_exports e JOIN projects p ON p.id=e.project_id AND p.owner_id=e.owner_id WHERE e.id=$1 AND e.owner_id=$2", [id, this.ownerId]);
        if (!result.rows[0])
            throw new CadDomainError("EXPORT_UNAVAILABLE", "Export is unavailable.");
        return result.rows[0]!;
    }
    async claim(projectId: string, sessionId: string, modes: string[]) {
        const token = randomBytes(32).toString("hex");
        const result = await this.pool.query("WITH next AS (SELECT e.id FROM model_exports e JOIN projects p ON p.id=e.project_id AND p.owner_id=e.owner_id WHERE e.owner_id=$1 AND e.project_id=$2 AND e.mode=ANY($5::text[]) AND e.mode<>'local-worker' AND e.state='PENDING' AND e.session_id IS NULL AND e.deadline>now() ORDER BY e.created_at FOR UPDATE OF e SKIP LOCKED LIMIT 1), claimed AS (UPDATE model_exports e SET session_id=$3,token_hash=$4,updated_at=now() FROM next WHERE e.id=next.id RETURNING e.*) SELECT claimed.*,r.source FROM claimed JOIN revisions r ON r.id=claimed.revision_id AND r.project_id=claimed.project_id", [this.ownerId, projectId, sessionId, sha256(token), modes]);
        const row = result.rows[0];
        return row ? { jobId: row.id, projectId, revision: row.revision_id, source: row.source, sourceHash: row.source_hash, format: row.format, token, deadline: new Date(row.deadline).toISOString() } : undefined;
    }
    async receipt(row: ExportRow, origin: string): Promise<ExportReceipt> {
        return issueExportReceipt(this.pool, this.ownerId, row, origin);
    }
}
