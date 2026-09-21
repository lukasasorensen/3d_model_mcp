import { randomBytes, randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { CAD_LIMITS, exportMetadataSchema, type ExportReceipt } from "@rjls/contracts";
import { CadDomainError } from "./cad-domain-error.js";
import { sha256 } from "./hash.js";
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
            await client.query("SELECT pg_advisory_xact_lock(820461)");
            const target = await client.query("SELECT r.source_hash FROM projects p JOIN revisions r ON r.id=p.current_revision_id AND r.project_id=p.id WHERE p.id=$1 AND p.owner_id=$2 AND r.id=$3 FOR UPDATE OF p", [projectId, this.ownerId, revision]);
            if (!target.rows[0])
                throw new CadDomainError("STALE_REVISION", "Export requires the current owned revision.");
            const existing = await client.query<ExportRow>("SELECT * FROM model_exports WHERE owner_id=$1 AND project_id=$2 AND revision_id=$3 AND format=$4 AND ((state='READY' AND expires_at>now()) OR (state='PENDING' AND deadline>now())) ORDER BY created_at DESC LIMIT 1", [this.ownerId, projectId, revision, format]);
            if (existing.rows[0]) {
                await client.query("COMMIT");
                return existing.rows[0];
            }
            const limit = format === "stl" ? CAD_LIMITS.previewBytes : CAD_LIMITS.exportBytes;
            const usage = await client.query("SELECT COALESCE(sum(reserved_bytes),0) AS total, COALESCE(sum(CASE WHEN owner_id=$1 THEN reserved_bytes ELSE 0 END),0) AS owned FROM model_exports WHERE (state='READY' AND expires_at>now()) OR (state='PENDING' AND deadline>now())", [this.ownerId]);
            if (Number(usage.rows[0].total) + limit > 2 * 1024 ** 3 || Number(usage.rows[0].owned) + limit > 250 * 1024 ** 2)
                throw new CadDomainError("EXPORT_CAPACITY", "Temporary export capacity is full; retry after expiry.", { retryable: true });
            const result = await client.query<ExportRow>("INSERT INTO model_exports (id,owner_id,project_id,revision_id,source_hash,format,mode,state,reserved_bytes,deadline,expires_at) VALUES ($1,$2,$3,$4,$5,$6,$7,'PENDING',$8,now()+interval '90 seconds',now()+interval '1 hour') RETURNING *", [randomUUID(), this.ownerId, projectId, revision, target.rows[0].source_hash, format, mode, limit]);
            await client.query("SELECT pg_notify('rjls_changes',$1)", [JSON.stringify({ kind: "render", ownerId: this.ownerId, projectId, jobId: result.rows[0]!.id })]);
            await client.query("COMMIT");
            return result.rows[0]!;
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
        const result = await this.pool.query("WITH next AS (SELECT e.id FROM model_exports e JOIN projects p ON p.id=e.project_id AND p.owner_id=e.owner_id WHERE e.owner_id=$1 AND e.project_id=$2 AND e.mode=ANY($5::text[]) AND e.state='PENDING' AND e.session_id IS NULL AND e.deadline>now() ORDER BY e.created_at FOR UPDATE OF e SKIP LOCKED LIMIT 1), claimed AS (UPDATE model_exports e SET session_id=$3,token_hash=$4,updated_at=now() FROM next WHERE e.id=next.id RETURNING e.*) SELECT claimed.*,r.source FROM claimed JOIN revisions r ON r.id=claimed.revision_id AND r.project_id=claimed.project_id", [this.ownerId, projectId, sessionId, sha256(token), modes]);
        const row = result.rows[0];
        return row ? { jobId: row.id, projectId, revision: row.revision_id, source: row.source, sourceHash: row.source_hash, format: row.format, token, deadline: new Date(row.deadline).toISOString() } : undefined;
    }
    async receipt(row: ExportRow, origin: string): Promise<ExportReceipt> {
        const metadata = exportMetadataSchema.parse(row.metadata);
        const token = randomBytes(32).toString("hex");
        const expiry = new Date(Math.min(Date.now() + 600000, new Date(row.expires_at).getTime()));
        await this.pool.query("INSERT INTO export_download_tokens (hash,export_id,expires_at) SELECT $1,id,$3 FROM model_exports WHERE id=$2 AND owner_id=$4 AND state='READY' AND expires_at>now()", [sha256(token), row.id, expiry, this.ownerId]);
        return { ...metadata, downloadUrl: `${origin}/v1/exports/${row.id}/download?token=${token}`, downloadExpiresAt: expiry.toISOString() };
    }
}
