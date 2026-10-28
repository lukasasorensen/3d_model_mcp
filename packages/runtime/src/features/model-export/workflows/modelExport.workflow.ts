import { exportMetadataSchema } from "@theoryfoundry/contracts";
import type { ModelExportsStore } from "@theoryfoundry/model-project";
import {
  CadDomainError,
  sha256,
  type ProjectDatabase,
} from "@theoryfoundry/model-project";
import type { PoolClient } from "pg";
import { waitForRenderOutcome } from "../../browser-rendering/index.js";
import type { ExportFileStore } from "../exportFileStore.port.js";
import type { ExportArtifactFinalizationService } from "../services/artifactFinalization.service.js";
export class ModelExportWorkflow {
  constructor(
    private readonly database: ProjectDatabase,
    private readonly files: ExportFileStore,
    private readonly createRepository: (ownerId: string) => ModelExportsStore,
    private readonly lockCapacity: (client: PoolClient) => Promise<void>,
    private readonly recoverExports: (
      client: PoolClient,
      now: Date,
    ) => Promise<void>,
    private readonly finalizer: ExportArtifactFinalizationService,
  ) {}
  async generate(
    ownerId: string,
    input: {
      projectId: string;
      revision: string;
      format: "stl" | "3mf";
      signal?: AbortSignal;
    },
    mode: string,
    origin: string,
  ) {
    await this.cleanup();
    const repository = this.createRepository(ownerId);
    const accepted = await repository.accept(
      input.projectId,
      input.revision,
      input.format,
      mode,
    );
    const row = await waitForRenderOutcome({
      changes: this.database.notifications,
      ownerId,
      jobId: accepted.id,
      signal: input.signal,
      read: async () => {
        const row = await repository.get(accepted.id);
        if (
          row.state === "READY" &&
          new Date(row.expires_at).getTime() > Date.now()
        )
          return { result: row, deadline: 0 };
        if (
          row.state !== "PENDING" ||
          new Date(row.deadline).getTime() <= Date.now()
        )
          throw new CadDomainError(
            "EXPORT_UNAVAILABLE",
            "Export failed or expired. Retry with the project visible.",
            { retryable: true },
          );
        return {
          deadline: Math.min(
            Date.now() + 500,
            new Date(row.deadline).getTime(),
          ),
        };
      },
    });
    process.stderr.write(
      `${JSON.stringify({ event: "model-export", outcome: "ready", format: row.format })}\n`,
    );
    return repository.receipt(row, origin);
  }
  async complete(
    ownerId: string,
    projectId: string,
    id: string,
    sessionId: string,
    token: string,
    sourceHash: string,
    bytes: Uint8Array,
  ) {
    const client = await this.database.pool.connect();
    try {
      await client.query("BEGIN");
      const result = await client.query(
        "SELECT e.*,p.name FROM model_exports e JOIN projects p ON p.id=e.project_id AND p.owner_id=e.owner_id WHERE e.id=$1 AND e.owner_id=$2 AND e.project_id=$3 AND e.state='PENDING' AND e.session_id=$4 AND e.token_hash=$5 AND e.source_hash=$6 AND e.deadline>now() FOR UPDATE OF e",
        [id, ownerId, projectId, sessionId, sha256(token), sourceHash],
      );
      const row = result.rows[0];
      if (!row)
        throw new CadDomainError(
          "EXPORT_UNAVAILABLE",
          "Export completion binding failed.",
        );
      await this.finalizer.finalize(client, row, bytes, new Date());
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      // A failed COMMIT can have an uncertain outcome; orphan cleanup reconciles files later.
      throw error;
    } finally {
      client.release();
    }
  }
  async fail(
    ownerId: string,
    projectId: string,
    id: string,
    sessionId: string,
    token: string,
    sourceHash: string,
  ) {
    const result = await this.database.pool.query(
      "UPDATE model_exports SET state='FAILED',token_hash=NULL,reserved_bytes=0,updated_at=now() WHERE id=$1 AND owner_id=$2 AND project_id=$3 AND session_id=$4 AND token_hash=$5 AND source_hash=$6 AND state='PENDING' AND deadline>now() RETURNING id",
      [id, ownerId, projectId, sessionId, sha256(token), sourceHash],
    );
    if (!result.rows[0])
      throw new CadDomainError(
        "EXPORT_UNAVAILABLE",
        "Export completion binding failed.",
      );
  }
  async download(id: string, token: string) {
    const result = await this.database.pool.query(
      "SELECT e.metadata FROM export_download_tokens t JOIN model_exports e ON e.id=t.export_id JOIN projects p ON p.id=e.project_id AND p.owner_id=e.owner_id WHERE t.hash=$1 AND e.id=$2 AND t.expires_at>now() AND e.expires_at>now() AND e.state='READY'",
      [sha256(token), id],
    );
    if (!result.rows[0])
      throw new CadDomainError(
        "EXPORT_UNAVAILABLE",
        "Download is unavailable or expired.",
      );
    const metadata = exportMetadataSchema.parse(result.rows[0].metadata);
    const bytes = await this.files.read(id);
    if (
      bytes.byteLength !== metadata.byteSize ||
      sha256(bytes) !== metadata.hash
    )
      throw new CadDomainError(
        "ARTIFACT_HASH_MISMATCH",
        "Stored export integrity failed.",
      );
    return { metadata, bytes };
  }
  async cleanup() {
    const client = await this.database.pool.connect();
    let expired: { id: string }[];
    try {
      await client.query("BEGIN");
      await this.lockCapacity(client);
      await this.recoverExports(client, new Date());
      expired = (
        await client.query(
          "DELETE FROM model_exports WHERE expires_at<=now() OR (state='PENDING' AND deadline<=now()) RETURNING id",
        )
      ).rows;
      await client.query(
        "DELETE FROM export_download_tokens WHERE expires_at<=now()",
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
    for (const row of expired) await this.files.remove(row.id);
    const retained = await this.database.pool.query(
      "SELECT id FROM model_exports",
    );
    await this.files.reconcile(new Set(retained.rows.map((row) => row.id)));
  }
}
