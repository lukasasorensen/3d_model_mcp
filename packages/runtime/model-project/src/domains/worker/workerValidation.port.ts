import type { ProjectPersistence } from "../project/index.js";
import type { WorkerValidationJob } from "./workerValidation.types.js";
export interface WorkerValidationTransactionPort {
  readonly candidates: ProjectPersistence;
  lockOwner(): Promise<void>;
  expired(now: Date): Promise<WorkerValidationJob[]>;
  activeCount(): Promise<number>;
  create(input: {
    id: string;
    projectId: string;
    candidateId: string;
    attemptId: string;
    sourceHash: string;
    tokenHash: string;
    deadline: Date;
  }): Promise<void>;
  find(
    input: {
      jobId: string;
      projectId: string;
      candidateId: string;
    },
    tokenHash: string,
  ): Promise<WorkerValidationJob>;
  finish(
    id: string,
    state: WorkerValidationJob["state"],
    now: Date,
    completionHash?: string,
    completion?: unknown,
  ): Promise<void>;
}
export interface WorkerValidationJobsPort {
  transaction<T>(
    operation: (transaction: WorkerValidationTransactionPort) => Promise<T>,
  ): Promise<T>;
}
