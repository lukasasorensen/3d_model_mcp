import { randomBytes, randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { CAD_LIMITS, WORKER_EXPORT_LIMITS, beginWorkerExportSchema, workerExportCapabilitySchema, completeWorkerExportSchema,
  workerExportLeaseSchema, workerExportStatusSchema, reusedWorkerExportSchema, acceptsWorkerRenderer,
  type RendererProvenance, type WorkerExportMetadata } from "@theoryfoundry/contracts";
import { CadDomainError } from "../cad-domain-error.js";
import { sha256 } from "../hash.js";
import { VALIDATION_POLICY_VERSION } from "../repository.js";
import { reserveExport } from "../exports/export-reservation.repository.js";
import { issueExportReceipt } from "../exports/export-receipt.repository.js";
import type { ExportRow } from "../model-exports.repository.js";
import { WorkerExportJobsRepository, type WorkerExportJob, type WorkerExportTransaction } from "./export-job.repository.js";

export interface WorkerExportDependencies {
  renderer: RendererProvenance;
  finalize: (client: PoolClient, row: ExportRow & { name: string }, bytes: Uint8Array, now: Date) => Promise<WorkerExportMetadata>;
  clock?: () => Date;
}

export class WorkerExportService {
  private readonly jobs: WorkerExportJobsRepository;
  private readonly clock: () => Date;
  constructor(pool: Pool, private readonly ownerId: string, private readonly origin: string, private readonly dependencies: WorkerExportDependencies) {
    this.jobs = new WorkerExportJobsRepository(pool, ownerId);
    this.clock = dependencies.clock ?? (() => new Date());
  }

  async begin(raw: unknown) {
    const input = beginWorkerExportSchema.parse(raw);
    return this.jobs.transaction(this.clock, async (transaction, now) => {
      const { row, created, source } = await reserveExport(transaction.client, this.ownerId,
        { ...input, revision: input.revisionId, mode: "local-worker" }, now, WORKER_EXPORT_LIMITS.leaseMs);
      if (row.state === "READY") return reusedWorkerExportSchema.parse({ version: "1", state: "COMPLETED", reused: true,
        metadata: row.metadata, receipt: await issueExportReceipt(transaction.client, this.ownerId, row, this.origin, now) });
      if (!created) throw new CadDomainError("WORKER_CAPACITY", "This worker export is already pending; retry after its lease expires.", { retryable: true });
      if (await transaction.activeCount(now) >= WORKER_EXPORT_LIMITS.activePerOwner) {
        throw new CadDomainError("WORKER_CAPACITY", "Worker export capacity reached.", { retryable: true });
      }
      const token = randomBytes(32).toString("hex");
      const job = await transaction.create(row, `export-${randomUUID()}`, sha256(token));
      return workerExportLeaseSchema.parse({ version: "1", state: "PENDING", projectId: input.projectId,
        revisionId: input.revisionId, format: input.format, jobId: job.id, exportId: row.id, token, source,
        sourceHash: row.source_hash, deadline: new Date(row.deadline).toISOString(), renderer: this.dependencies.renderer, executionOrigin: "local-worker" });
    });
  }

  private async snapshot(transaction: WorkerExportTransaction, job: WorkerExportJob, now: Date) {
    const artifact = job.state === "COMPLETED" ? await transaction.artifact(job) : undefined;
    const available = artifact?.state === "READY" && new Date(artifact.expires_at).getTime() > now.getTime();
    return workerExportStatusSchema.parse({ version: "1", jobId: job.id, exportId: job.export_id, projectId: job.project_id,
      revisionId: job.revision_id, format: job.format, sourceHash: job.source_hash, state: job.state,
      deadline: new Date(job.deadline).toISOString(), executionOrigin: "local-worker", artifactAvailable: available,
      ...(job.completion ? { metadata: job.completion } : {}),
      ...(available ? { receipt: await issueExportReceipt(transaction.client, this.ownerId, artifact, this.origin, now) } : {}),
    });
  }

  async status(raw: unknown) {
    const input = workerExportCapabilitySchema.parse(raw);
    return this.jobs.transaction(this.clock, async (transaction, now) => this.snapshot(transaction,
      await transaction.find(input, sha256(input.token), now), now));
  }

  async complete(raw: unknown, uploaded?: Uint8Array) {
    const input = completeWorkerExportSchema.parse(raw);
    const bytes = uploaded === undefined ? undefined : Buffer.from(uploaded);
    if (input.outcome === "COMPLETED" && (!bytes?.byteLength || bytes.byteLength > (input.format === "stl" ? CAD_LIMITS.previewBytes : CAD_LIMITS.exportBytes))) {
      throw new CadDomainError("ARTIFACT_LIMIT_EXCEEDED", "Worker export exceeds its format byte limit or is empty.");
    }
    if (input.outcome === "FAILED" && bytes !== undefined) throw new CadDomainError("EXPORT_UNAVAILABLE", "Failed completion must not include an artifact.");
    if (!acceptsWorkerRenderer(input.provenance) || input.provenance.validationPolicyVersion !== VALIDATION_POLICY_VERSION) {
      throw new CadDomainError("PROVENANCE_MISMATCH", "Worker export renderer is not supported.");
    }
    const fingerprint = sha256(JSON.stringify({ outcome: input.outcome, provenance: input.provenance, artifactHash: bytes ? sha256(bytes) : null }));
    return this.jobs.transaction(this.clock, async (transaction, now) => {
      const job = await transaction.find(input, sha256(input.token), now);
      if (job.state === "COMPLETED" || job.state === "FAILED") {
        if (job.completion_hash !== fingerprint) throw new CadDomainError("EXPORT_UNAVAILABLE", "Completion conflicts with the saved result.");
        return this.snapshot(transaction, job, now);
      }
      if (job.state !== "PENDING") return this.snapshot(transaction, job, now);
      const row = await transaction.artifact(job);
      if (!row || row.mode !== "local-worker" || row.state !== "PENDING" || new Date(row.deadline).getTime() <= now.getTime()) {
        throw new CadDomainError("EXPORT_UNAVAILABLE", "Worker export is no longer active.");
      }
      const metadata = bytes ? await this.dependencies.finalize(transaction.client, row, bytes, now) : undefined;
      return this.snapshot(transaction, await transaction.finish(job, input.outcome, now, fingerprint, metadata), now);
    });
  }

  async cancel(raw: unknown) {
    const input = workerExportCapabilitySchema.parse(raw);
    return this.jobs.transaction(this.clock, async (transaction, now) => {
      const job = await transaction.find(input, sha256(input.token), now);
      return this.snapshot(transaction, job.state === "PENDING" ? await transaction.finish(job, "CANCELLED", now) : job, now);
    });
  }
}
