import type {
  ExportReceipt,
  WorkerExportCapability,
  WorkerExportMetadata,
} from "@theoryfoundry/contracts";
import type { ExportRow } from "./export.types.js";
import type { WorkerExportJob } from "./workerExport.types.js";
export interface WorkerExportTransactionPort {
  activeCount(now: Date): Promise<number>;
  create(
    row: ExportRow,
    jobId: string,
    tokenHash: string,
  ): Promise<WorkerExportJob>;
  find(
    input: WorkerExportCapability,
    tokenHash: string,
    now: Date,
  ): Promise<WorkerExportJob>;
  artifact(job: WorkerExportJob): Promise<
    | (ExportRow & {
        name: string;
      })
    | undefined
  >;
  finish(
    job: WorkerExportJob,
    state: WorkerExportJob["state"],
    now: Date,
    fingerprint?: string,
    metadata?: WorkerExportMetadata,
  ): Promise<WorkerExportJob>;
  reserve(
    input: {
      projectId: string;
      revision: string;
      format: "stl" | "3mf";
      mode: string;
    },
    now: Date,
    leaseMs: number,
  ): Promise<{ row: ExportRow; created: boolean; source: string }>;
  receipt(row: ExportRow, now: Date): Promise<ExportReceipt>;
  finalize(
    row: ExportRow & { name: string },
    bytes: Uint8Array,
    now: Date,
  ): Promise<WorkerExportMetadata>;
}
export interface WorkerExportJobsPort {
  transaction<T>(
    clock: () => Date,
    operation: (
      transaction: WorkerExportTransactionPort,
      now: Date,
    ) => Promise<T>,
  ): Promise<T>;
}
