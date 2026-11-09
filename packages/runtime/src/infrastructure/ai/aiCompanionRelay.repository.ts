import { createHash, randomBytes, randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import type { Pool } from "pg";
import {
  AI_LIMITS,
  AiConnectionError,
  companionJobInputSchema,
  companionJobResultSchema,
  type CompanionJobInput,
  type CompanionJobResult,
} from "@theoryfoundry/contracts";
import type {
  AiCompanionRelay,
  StoredAiConnection,
} from "../../domains/ai/index.js";

const digest = (value: string): string =>
  createHash("sha256").update(value).digest("hex");
export class AiCompanionRelayRepository implements AiCompanionRelay {
  constructor(private readonly pool: Pool) {}
  async register(
    owner: string,
    data: { id: string; name: string; provider: string },
    secret: string,
  ): Promise<void> {
    const saved = await this.pool.query(
      `INSERT INTO ai_companions (id,owner_id,name,provider,secret_hash) VALUES ($1,$2,$3,$4,$5)
      ON CONFLICT(id) DO UPDATE SET name=$3,last_seen_at=clock_timestamp(),updated_at=clock_timestamp()
      WHERE ai_companions.owner_id=$2 AND ai_companions.secret_hash=$5 AND ai_companions.provider=$4 RETURNING id`,
      [data.id, owner, data.name, data.provider, digest(secret)],
    );
    if (!saved.rowCount) throw new AiConnectionError("AI_AUTHENTICATION");
  }
  async authorize(
    owner: string,
    companion: string,
    secret: string,
  ): Promise<void> {
    const result = await this.pool.query(
      "UPDATE ai_companions SET last_seen_at=clock_timestamp() WHERE id=$1 AND owner_id=$2 AND secret_hash=$3 RETURNING id",
      [companion, owner, digest(secret)],
    );
    if (!result.rowCount) throw new AiConnectionError("AI_AUTHENTICATION");
  }
  async execute(
    owner: string,
    connection: StoredAiConnection,
    raw: CompanionJobInput,
    signal: AbortSignal,
    context?: { projectId: string; requestId: string },
  ): Promise<CompanionJobResult> {
    signal.throwIfAborted();
    const input = companionJobInputSchema.parse(raw);
    if (Buffer.byteLength(JSON.stringify(input)) > AI_LIMITS.invocationBytes)
      throw new AiConnectionError("AI_MODEL_UNSUPPORTED");
    const id = randomUUID();
    await this.cleanup();
    const inserted = await this.pool.query(
      `INSERT INTO ai_inference_jobs (id,owner_id,connection_id,companion_id,project_id,request_id,input,deadline)
      SELECT $1,$2,c.id,d.id,$5,$6,$7::jsonb,clock_timestamp()+interval '120 seconds' FROM ai_connections c
      JOIN ai_companions d ON d.id=c.companion_id AND d.owner_id=c.owner_id
      WHERE c.id=$3 AND c.owner_id=$2 AND d.id=$4 AND d.last_seen_at>clock_timestamp()-$8::interval
      AND ($5::text IS NULL OR EXISTS(SELECT 1 FROM projects WHERE id=$5 AND owner_id=$2 AND NOT is_deleted AND NOT is_archived))`,
      [
        id,
        owner,
        connection.id,
        connection.companionId,
        context?.projectId ?? null,
        context?.requestId ?? randomUUID(),
        JSON.stringify(input),
        `${AI_LIMITS.offlineMs} milliseconds`,
      ],
    );
    if (!inserted.rowCount) throw new AiConnectionError("AI_OFFLINE");
    const bounded = AbortSignal.any([signal, AbortSignal.timeout(120_000)]);
    try {
      while (true) {
        bounded.throwIfAborted();
        const result = await this.pool.query<{
          state: string;
          output: unknown;
          active: boolean;
        }>(
          `SELECT j.state,j.output,
          (j.deadline>clock_timestamp() AND (j.state<>'RUNNING' OR j.lease_until>clock_timestamp()) AND d.last_seen_at>clock_timestamp()-$3::interval) AS active
          FROM ai_inference_jobs j JOIN ai_companions d ON d.id=j.companion_id AND d.owner_id=j.owner_id WHERE j.id=$1 AND j.owner_id=$2`,
          [id, owner, `${AI_LIMITS.offlineMs} milliseconds`],
        );
        const row = result.rows[0];
        if (row?.state === "DONE")
          return companionJobResultSchema.parse(row.output);
        if (!row?.active || !["PENDING", "RUNNING"].includes(row.state))
          throw new AiConnectionError("AI_OFFLINE");
        await delay(200, undefined, { signal: bounded });
      }
    } finally {
      // Payloads are only a short-lived transport, never a conversation archive.
      await this.pool.query(
        "UPDATE ai_inference_jobs SET state=CASE WHEN state='DONE' THEN 'CONSUMED' ELSE 'CANCELLED' END,input=NULL,output=NULL,updated_at=clock_timestamp() WHERE id=$1 AND owner_id=$2",
        [id, owner],
      );
    }
  }
  async claim(
    owner: string,
    companion: string,
    signal: AbortSignal,
  ): Promise<{
    id: string;
    lease: string;
    deadline: string;
    input: CompanionJobInput;
  } | null> {
    const expires = Date.now() + AI_LIMITS.pollMs;
    do {
      signal.throwIfAborted();
      const lease = randomBytes(32).toString("hex");
      const result = await this.pool.query<{
        id: string;
        deadline: Date;
        input: unknown;
      }>(
        `UPDATE ai_inference_jobs SET state='RUNNING',lease_hash=$3,lease_until=LEAST(deadline,clock_timestamp()+$4::interval),updated_at=clock_timestamp()
        WHERE id=(SELECT id FROM ai_inference_jobs WHERE owner_id=$1 AND companion_id=$2 AND state='PENDING' AND deadline>clock_timestamp() ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1) RETURNING id,deadline,input`,
        [owner, companion, digest(lease), `${AI_LIMITS.leaseMs} milliseconds`],
      );
      const row = result.rows[0];
      if (row)
        return {
          id: row.id,
          lease,
          deadline: row.deadline.toISOString(),
          input: companionJobInputSchema.parse(row.input),
        };
      await delay(300, undefined, { signal });
    } while (Date.now() < expires);
    return null;
  }
  async heartbeat(
    owner: string,
    companion: string,
    id: string,
    lease: string,
  ): Promise<boolean> {
    return Boolean(
      (
        await this.pool.query(
          `UPDATE ai_inference_jobs SET lease_until=LEAST(deadline,clock_timestamp()+$5::interval) WHERE id=$1 AND owner_id=$2 AND companion_id=$3 AND lease_hash=$4 AND state='RUNNING' AND deadline>clock_timestamp() AND lease_until>clock_timestamp() RETURNING id`,
          [
            id,
            owner,
            companion,
            digest(lease),
            `${AI_LIMITS.leaseMs} milliseconds`,
          ],
        )
      ).rowCount,
    );
  }
  async complete(
    owner: string,
    companion: string,
    id: string,
    lease: string,
    raw: CompanionJobResult,
  ): Promise<void> {
    const output = companionJobResultSchema.parse(raw);
    const serialized = JSON.stringify(output);
    if (Buffer.byteLength(serialized) > AI_LIMITS.resultBytes)
      throw new AiConnectionError("AI_MODEL_UNSUPPORTED");
    const hash = digest(serialized);
    const result = await this.pool.query(
      `UPDATE ai_inference_jobs SET state='DONE',input=NULL,output=$5::jsonb,completion_hash=$6,updated_at=clock_timestamp()
      WHERE id=$1 AND owner_id=$2 AND companion_id=$3 AND lease_hash=$4 AND state='RUNNING' AND deadline>clock_timestamp() AND lease_until>clock_timestamp() RETURNING id`,
      [id, owner, companion, digest(lease), serialized, hash],
    );
    if (
      !result.rowCount &&
      !(
        await this.pool.query(
          "SELECT 1 FROM ai_inference_jobs WHERE id=$1 AND owner_id=$2 AND companion_id=$3 AND lease_hash=$4 AND state IN ('DONE','CONSUMED') AND completion_hash=$5",
          [id, owner, companion, digest(lease), hash],
        )
      ).rowCount
    )
      throw new AiConnectionError("AI_TIMEOUT");
  }
  async cleanup(): Promise<void> {
    await this.pool.query(
      "UPDATE ai_inference_jobs SET state='EXPIRED',input=NULL,output=NULL,updated_at=clock_timestamp() WHERE (deadline<=clock_timestamp() OR (state='RUNNING' AND lease_until<=clock_timestamp())) AND state IN ('PENDING','RUNNING','DONE')",
    );
    await this.pool.query(
      "DELETE FROM ai_inference_jobs WHERE deadline<clock_timestamp()-interval '5 minutes'",
    );
  }
}
