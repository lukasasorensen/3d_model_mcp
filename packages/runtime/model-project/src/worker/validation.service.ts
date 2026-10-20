import { randomBytes, randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { beginWorkerValidationSchema, completeWorkerValidationSchema, workerValidationCapabilitySchema, workerValidationLeaseSchema,
  workerValidationStatusSchema, WORKER_VALIDATION_LIMITS, acceptsWorkerRenderer, candidateRecordSchema } from "@theoryfoundry/contracts";
import { CandidateValidationService } from "../validation/candidate-validation.service.js";
import { WorkerValidationJobsRepository, type WorkerValidationTransaction, type WorkerValidationJob } from "./validation-job.repository.js";
import { CadDomainError } from "../cad-domain-error.js";
import { VALIDATION_POLICY_VERSION } from "../repository.js";
import { sha256 } from "../hash.js";

/** Server authority over local-worker attempts; geometry remains client-reported. */
export class WorkerValidationService {
  private readonly jobs: WorkerValidationJobsRepository;
  private readonly validation: CandidateValidationService;
  constructor(pool: Pool, ownerId: string, private readonly clock: () => Date = () => new Date()) {
    this.jobs = new WorkerValidationJobsRepository(pool, ownerId);
    this.validation = new CandidateValidationService({ clock, validationPolicyVersion: VALIDATION_POLICY_VERSION, acceptRendererProvenance: acceptsWorkerRenderer });
  }
  private async execute<T>(operation: (transaction: WorkerValidationTransaction, now: Date) => Promise<T>): Promise<T> {
    const result = await this.jobs.transaction(async transaction => {
      const now = this.clock();
      for (const job of await transaction.expired(now)) {
        await this.validation.complete(transaction.candidates, { projectId: job.project_id, candidateId: job.candidate_id, attemptId: job.attempt_id, sourceHash: job.source_hash,
          error: new CadDomainError("RENDER_FAILED", "Worker validation expired; retry the same candidate.", { retryable: true }) });
        await transaction.finish(job.id, "EXPIRED", now);
      }
      // Expected errors must not roll back lease recovery performed above.
      try { return { value: await operation(transaction, now) }; }
      catch (error) { if (error instanceof CadDomainError) return { error }; throw error; }
    });
    if (result.error) throw result.error;
    return result.value as T;
  }
  async begin(raw: unknown) {
    const input = beginWorkerValidationSchema.parse(raw);
    return this.execute(async (transaction, now) => {
      await transaction.candidates.requireProject(input.projectId);
      if (await transaction.activeCount() >= WORKER_VALIDATION_LIMITS.activePerOwner) throw new CadDomainError("WORKER_CAPACITY", "Worker validation capacity reached.", { retryable: true });
      const claimed = await this.validation.begin(transaction.candidates, input);
      if (!claimed.attemptId) throw new CadDomainError("INVALID_CANDIDATE_STATE", "Candidate is already valid; request its state instead.");
      const token = randomBytes(32).toString("hex"), id = `worker-${randomUUID()}`;
      const deadline = new Date(now.getTime() + WORKER_VALIDATION_LIMITS.leaseMs);
      await transaction.create({ ...input, id, attemptId: claimed.attemptId, sourceHash: claimed.candidate.sourceHash, tokenHash: sha256(token), deadline });
      return workerValidationLeaseSchema.parse({ version: "1", projectId: input.projectId, candidateId: input.candidateId, jobId: id, attemptId: claimed.attemptId,
        source: claimed.source, sourceHash: claimed.candidate.sourceHash, token, deadline: deadline.toISOString(), validationPolicyVersion: VALIDATION_POLICY_VERSION, executionOrigin: "local-worker" });
    });
  }
  private statusOf(job: WorkerValidationJob) {
    return workerValidationStatusSchema.parse({ version: "1", jobId: job.id, state: job.state, deadline: new Date(job.deadline).toISOString(),
      ...(job.completion ? { candidate: candidateRecordSchema.parse(job.completion) } : {}), executionOrigin: "local-worker" });
  }
  async status(raw: unknown) {
    const input = workerValidationCapabilitySchema.parse(raw);
    return this.execute(async transaction => this.statusOf(await transaction.find(input, sha256(input.token))));
  }
  async complete(raw: unknown) {
    const input = completeWorkerValidationSchema.parse(raw);
    return this.execute(async (transaction, now) => {
      const job = await transaction.find(input, sha256(input.token));
      const hash = sha256(JSON.stringify(input.result));
      if (job.state === "COMPLETED") {
        if (job.completion_hash !== hash || input.sourceHash !== job.source_hash) throw new CadDomainError("STALE_REVISION", "Completion conflicts with the saved result.");
        return this.statusOf(job);
      }
      if (job.state !== "PENDING") return this.statusOf(job);
      if (input.sourceHash !== job.source_hash) throw new CadDomainError("SOURCE_HASH_MISMATCH", "Worker source does not match the lease.");
      if (!acceptsWorkerRenderer(input.result.provenance) || input.result.provenance.validationPolicyVersion !== VALIDATION_POLICY_VERSION) throw new CadDomainError("PROVENANCE_MISMATCH", "Worker renderer is not supported.");
      const candidate = (await transaction.candidates.readCandidate(input.projectId, input.candidateId, true)).candidate;
      if (candidate.state !== "RUNNING" || candidate.activeAttemptId !== job.attempt_id) throw new CadDomainError("STALE_REVISION", "Validation attempt is no longer active.");
      if (input.result.outcome === "VALID" && !input.result.geometry) throw new CadDomainError("INVALID_PREVIEW", "Worker geometry is required for successful validation.");
      const failed = input.result.outcome === "FAILED";
      const result = await this.validation.complete(transaction.candidates, { ...input, attemptId: job.attempt_id,
        rawResult: { ...input.result, artifacts: [], validationPolicyVersion: VALIDATION_POLICY_VERSION },
        ...(failed ? { error: new CadDomainError("RENDER_FAILED", "Local worker failed; retry the same candidate.", { retryable: true }) } : {}) });
      await transaction.finish(job.id, "COMPLETED", now, hash, result.candidate);
      return this.statusOf({ ...job, state: "COMPLETED", completion_hash: hash, completion: result.candidate });
    });
  }
  async cancel(raw: unknown) {
    const input = workerValidationCapabilitySchema.parse(raw);
    return this.execute(async (transaction, now) => {
      const job = await transaction.find(input, sha256(input.token));
      if (job.state !== "PENDING") return this.statusOf(job);
      await this.validation.complete(transaction.candidates, { ...input, attemptId: job.attempt_id, sourceHash: job.source_hash,
        error: new CadDomainError("CANCELLED", "Worker validation cancelled; retry the same candidate.", { retryable: true }) });
      await transaction.finish(job.id, "CANCELLED", now);
      return this.statusOf({ ...job, state: "CANCELLED" });
    });
  }
}
