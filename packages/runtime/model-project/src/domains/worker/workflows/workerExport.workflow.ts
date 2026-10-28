import type { WorkerExportOperations } from "../workerOperations.port.js";
import {
  CAD_LIMITS,
  WORKER_EXPORT_LIMITS,
  acceptsWorkerRenderer,
  beginWorkerExportSchema,
  completeWorkerExportSchema,
  reusedWorkerExportSchema,
  workerExportCapabilitySchema,
  workerExportLeaseSchema,
  workerExportStatusSchema,
  type RendererProvenance,
} from "@theoryfoundry/contracts";
import { randomBytes, randomUUID } from "node:crypto";
import { CadDomainError } from "../../../shared/utils/cadDomainError.util.js";
import { sha256 } from "../../../shared/utils/hash.util.js";
import { VALIDATION_POLICY_VERSION } from "../../project/index.js";
import type {
  WorkerExportJobsPort,
  WorkerExportTransactionPort,
} from "../workerExport.port.js";
import type { WorkerExportJob } from "../workerExport.types.js";

export class WorkerExportWorkflow {
  constructor(
    private readonly jobs: WorkerExportJobsPort,
    private readonly renderer: RendererProvenance,
    private readonly clock: () => Date = () => new Date(),
  ) {}
  async begin(raw: unknown): ReturnType<WorkerExportOperations["begin"]> {
    const input = beginWorkerExportSchema.parse(raw);
    return this.jobs.transaction(this.clock, async (transaction, now) => {
      const { row, created, source } = await transaction.reserve(
        { ...input, revision: input.revisionId, mode: "local-worker" },
        now,
        WORKER_EXPORT_LIMITS.leaseMs,
      );
      if (row.state === "READY")
        return reusedWorkerExportSchema.parse({
          version: "1",
          state: "COMPLETED",
          reused: true,
          metadata: row.metadata,
          receipt: await transaction.receipt(row, now),
        });
      if (!created)
        throw new CadDomainError(
          "WORKER_CAPACITY",
          "This worker export is already pending; retry after its lease expires.",
          { retryable: true },
        );
      if (
        (await transaction.activeCount(now)) >=
        WORKER_EXPORT_LIMITS.activePerOwner
      ) {
        throw new CadDomainError(
          "WORKER_CAPACITY",
          "Worker export capacity reached.",
          { retryable: true },
        );
      }
      const token = randomBytes(32).toString("hex");
      const job = await transaction.create(
        row,
        `export-${randomUUID()}`,
        sha256(token),
      );
      return workerExportLeaseSchema.parse({
        version: "1",
        state: "PENDING",
        projectId: input.projectId,
        revisionId: input.revisionId,
        format: input.format,
        jobId: job.id,
        exportId: row.id,
        token,
        source,
        sourceHash: row.source_hash,
        deadline: new Date(row.deadline).toISOString(),
        renderer: this.renderer,
        executionOrigin: "local-worker",
      });
    });
  }

  private async snapshot(
    transaction: WorkerExportTransactionPort,
    job: WorkerExportJob,
    now: Date,
  ): ReturnType<WorkerExportOperations["status"]> {
    const artifact =
      job.state === "COMPLETED" ? await transaction.artifact(job) : undefined;
    const available =
      artifact?.state === "READY" &&
      new Date(artifact.expires_at).getTime() > now.getTime();
    return workerExportStatusSchema.parse({
      version: "1",
      jobId: job.id,
      exportId: job.export_id,
      projectId: job.project_id,
      revisionId: job.revision_id,
      format: job.format,
      sourceHash: job.source_hash,
      state: job.state,
      deadline: new Date(job.deadline).toISOString(),
      executionOrigin: "local-worker",
      artifactAvailable: available,
      ...(job.completion ? { metadata: job.completion } : {}),
      ...(available
        ? { receipt: await transaction.receipt(artifact, now) }
        : {}),
    });
  }

  async status(raw: unknown): ReturnType<WorkerExportOperations["status"]> {
    const input = workerExportCapabilitySchema.parse(raw);
    return this.jobs.transaction(this.clock, async (transaction, now) =>
      this.snapshot(
        transaction,
        await transaction.find(input, sha256(input.token), now),
        now,
      ),
    );
  }

  async complete(
    raw: unknown,
    uploaded?: Uint8Array,
  ): ReturnType<WorkerExportOperations["complete"]> {
    const input = completeWorkerExportSchema.parse(raw);
    const bytes = uploaded === undefined ? undefined : Buffer.from(uploaded);
    if (
      input.outcome === "COMPLETED" &&
      (!bytes?.byteLength ||
        bytes.byteLength >
          (input.format === "stl"
            ? CAD_LIMITS.previewBytes
            : CAD_LIMITS.exportBytes))
    ) {
      throw new CadDomainError(
        "ARTIFACT_LIMIT_EXCEEDED",
        "Worker export exceeds its format byte limit or is empty.",
      );
    }
    if (input.outcome === "FAILED" && bytes !== undefined)
      throw new CadDomainError(
        "EXPORT_UNAVAILABLE",
        "Failed completion must not include an artifact.",
      );
    if (
      !acceptsWorkerRenderer(input.provenance) ||
      input.provenance.validationPolicyVersion !== VALIDATION_POLICY_VERSION
    ) {
      throw new CadDomainError(
        "PROVENANCE_MISMATCH",
        "Worker export renderer is not supported.",
      );
    }
    const fingerprint = sha256(
      JSON.stringify({
        outcome: input.outcome,
        provenance: input.provenance,
        artifactHash: bytes ? sha256(bytes) : null,
      }),
    );
    return this.jobs.transaction(this.clock, async (transaction, now) => {
      const job = await transaction.find(input, sha256(input.token), now);
      if (job.state === "COMPLETED" || job.state === "FAILED") {
        if (job.completion_hash !== fingerprint)
          throw new CadDomainError(
            "EXPORT_UNAVAILABLE",
            "Completion conflicts with the saved result.",
          );
        return this.snapshot(transaction, job, now);
      }
      if (job.state !== "PENDING") return this.snapshot(transaction, job, now);
      const row = await transaction.artifact(job);
      if (
        !row ||
        row.mode !== "local-worker" ||
        row.state !== "PENDING" ||
        new Date(row.deadline).getTime() <= now.getTime()
      ) {
        throw new CadDomainError(
          "EXPORT_UNAVAILABLE",
          "Worker export is no longer active.",
        );
      }
      const metadata = bytes
        ? await transaction.finalize(row, bytes, now)
        : undefined;
      return this.snapshot(
        transaction,
        await transaction.finish(
          job,
          input.outcome,
          now,
          fingerprint,
          metadata,
        ),
        now,
      );
    });
  }

  async cancel(raw: unknown): ReturnType<WorkerExportOperations["cancel"]> {
    const input = workerExportCapabilitySchema.parse(raw);
    return this.jobs.transaction(this.clock, async (transaction, now) => {
      const job = await transaction.find(input, sha256(input.token), now);
      return this.snapshot(
        transaction,
        job.state === "PENDING"
          ? await transaction.finish(job, "CANCELLED", now)
          : job,
        now,
      );
    });
  }
}
