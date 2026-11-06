import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import {
  AI_LIMITS,
  AiConnectionError,
  aiConnectionInputSchema,
  type AiConnectionInput,
  type AiConnectionSummary,
  type CompanionSummary,
} from "@theoryfoundry/contracts";
import type {
  AiConnectionsStore,
  StoredAiConnection,
} from "../../domains/ai/index.js";
import {
  decryptAiCredential,
  encryptAiCredential,
} from "../../shared/utils/aiCredential.util.js";
import { resolvePublicAiEndpoint } from "../../shared/utils/publicAiEndpoint.util.js";

interface ConnectionRow {
  id: string;
  name: string;
  provider: AiConnectionInput["provider"];
  location: AiConnectionInput["location"];
  model: string;
  endpoint: string | null;
  companion_id: string | null;
  credential: string | null;
  is_default: boolean;
  online?: boolean;
}
function connection(row: ConnectionRow): StoredAiConnection {
  return {
    id: row.id,
    name: row.name,
    provider: row.provider,
    location: row.location,
    model: row.model,
    isDefault: row.is_default,
    ...(row.endpoint ? { endpoint: row.endpoint } : {}),
    ...(row.companion_id ? { companionId: row.companion_id } : {}),
    credential: row.credential,
  };
}
export class AiConnectionsRepository implements AiConnectionsStore {
  constructor(private readonly pool: Pool) {}
  async list(ownerId: string): Promise<{
    connections: AiConnectionSummary[];
    companions: CompanionSummary[];
  }> {
    const [rows, devices] = await Promise.all([
      this.pool.query<ConnectionRow>(
        "SELECT c.*, (d.last_seen_at > clock_timestamp() - $2::interval) AS online FROM ai_connections c LEFT JOIN ai_companions d ON d.id=c.companion_id AND d.owner_id=c.owner_id WHERE c.owner_id=$1 ORDER BY c.created_at,c.id",
        [ownerId, `${AI_LIMITS.offlineMs} milliseconds`],
      ),
      this.pool.query<{
        id: string;
        name: string;
        provider: "ollama" | "openai-compatible";
        online: boolean;
      }>(
        "SELECT id,name,provider,(last_seen_at > clock_timestamp()-$2::interval) AS online FROM ai_companions WHERE owner_id=$1 ORDER BY created_at,id",
        [ownerId, `${AI_LIMITS.offlineMs} milliseconds`],
      ),
    ]);
    return {
      connections: rows.rows.map((row) => {
        let status: AiConnectionSummary["status"] =
          row.location === "local" && !row.online ? "offline" : "ready";
        if (row.location === "hosted") {
          try {
            if (!row.credential) throw new Error();
            decryptAiCredential(row.credential, ownerId, row.id);
          } catch {
            status = "credential-unavailable";
          }
        }
        const value = connection(row);
        return {
          id: value.id,
          name: value.name,
          provider: value.provider,
          location: value.location,
          model: value.model,
          isDefault: value.isDefault,
          ...(value.endpoint ? { endpoint: value.endpoint } : {}),
          ...(value.companionId ? { companionId: value.companionId } : {}),
          hasCredential: Boolean(row.credential),
          status,
        };
      }),
      companions: devices.rows,
    };
  }
  async read(ownerId: string, id?: string): Promise<StoredAiConnection> {
    const result = await this.pool.query<ConnectionRow>(
      "SELECT * FROM ai_connections WHERE owner_id=$1 AND (CASE WHEN $2::text IS NULL THEN is_default ELSE id=$2 END)",
      [ownerId, id ?? null],
    );
    if (!result.rows[0]) throw new AiConnectionError("AI_CONFIGURATION");
    return connection(result.rows[0]);
  }
  async save(
    ownerId: string,
    raw: AiConnectionInput,
    id = randomUUID(),
  ): Promise<string> {
    const input = aiConnectionInputSchema.parse(raw);
    if (input.endpoint) await resolvePublicAiEndpoint(input.endpoint);
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const owner = await client.query(
        'SELECT id FROM "user" WHERE id=$1 FOR UPDATE',
        [ownerId],
      );
      if (!owner.rowCount) throw new AiConnectionError("AI_CONFIGURATION");
      const existing = await client.query<ConnectionRow>(
        "SELECT * FROM ai_connections WHERE id=$1 AND owner_id=$2 FOR UPDATE",
        [id, ownerId],
      );
      const previous = existing.rows[0];
      if (
        input.companionId &&
        !(
          await client.query(
            "SELECT 1 FROM ai_companions WHERE id=$1 AND owner_id=$2 AND provider=$3",
            [input.companionId, ownerId, input.provider],
          )
        ).rowCount
      )
        throw new AiConnectionError("AI_CONFIGURATION");
      const canReuse =
        previous?.provider === input.provider &&
        previous.location === input.location &&
        previous.endpoint === (input.endpoint ?? null);
      const credential =
        input.location === "local"
          ? null
          : input.token
            ? encryptAiCredential(input.token, ownerId, id)
            : canReuse
              ? previous.credential
              : null;
      if (input.location === "hosted" && !credential)
        throw new AiConnectionError("AI_CONFIGURATION");
      if (input.isDefault)
        await client.query(
          "UPDATE ai_connections SET is_default=false WHERE owner_id=$1 AND is_default",
          [ownerId],
        );
      const saved = await client.query(
        `INSERT INTO ai_connections (id,owner_id,name,provider,location,model,endpoint,companion_id,credential,is_default)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT(id) DO UPDATE SET name=$3,provider=$4,location=$5,model=$6,endpoint=$7,companion_id=$8,credential=$9,is_default=$10,updated_at=clock_timestamp() WHERE ai_connections.owner_id=$2 RETURNING id`,
        [
          id,
          ownerId,
          input.name,
          input.provider,
          input.location,
          input.model,
          input.endpoint ?? null,
          input.companionId ?? null,
          credential,
          input.isDefault,
        ],
      );
      if (!saved.rowCount) throw new AiConnectionError("AI_CONFIGURATION");
      await client.query("COMMIT");
      return id;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
  async remove(ownerId: string, id: string): Promise<void> {
    if (
      !(
        await this.pool.query(
          "DELETE FROM ai_connections WHERE owner_id=$1 AND id=$2",
          [ownerId, id],
        )
      ).rowCount
    )
      throw new AiConnectionError("AI_CONFIGURATION");
  }
}
