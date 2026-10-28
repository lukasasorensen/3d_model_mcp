import { acceptsWorkerRenderer } from "@theoryfoundry/contracts";
import type { Pool } from "pg";
import {
  CandidateValidationService,
  VALIDATION_POLICY_VERSION,
} from "./domains/project/index.js";
import { WorkerValidationWorkflow } from "./domains/worker/index.js";
import {
  PostgresProjectPersistence,
  WorkerValidationJobsRepository,
  WorkerValidationTransaction,
} from "./infrastructure/index.js";
export class WorkerValidationService {
  private readonly workflow: WorkerValidationWorkflow;
  constructor(
    pool: Pool,
    ownerId: string,
    clock: () => Date = () => new Date(),
  ) {
    const jobs = new WorkerValidationJobsRepository(
      pool,
      (client) =>
        new WorkerValidationTransaction(
          client,
          ownerId,
          new PostgresProjectPersistence(pool, ownerId, client),
        ),
    );
    const validation = new CandidateValidationService({
      clock,
      validationPolicyVersion: VALIDATION_POLICY_VERSION,
      acceptRendererProvenance: acceptsWorkerRenderer,
    });
    this.workflow = new WorkerValidationWorkflow(jobs, validation, clock);
  }
  begin: WorkerValidationWorkflow["begin"] = (...args) =>
    this.workflow.begin(...args);
  status: WorkerValidationWorkflow["status"] = (...args) =>
    this.workflow.status(...args);
  complete: WorkerValidationWorkflow["complete"] = (...args) =>
    this.workflow.complete(...args);
  cancel: WorkerValidationWorkflow["cancel"] = (...args) =>
    this.workflow.cancel(...args);
}
