import type {
  reusedWorkerExportSchema,
  workerExportLeaseSchema,
  workerExportStatusSchema,
  workerValidationLeaseSchema,
  workerValidationStatusSchema,
} from "@theoryfoundry/contracts";
import type { z } from "zod";
type WorkerValidationLease = z.infer<typeof workerValidationLeaseSchema>;
type WorkerValidationStatus = z.infer<typeof workerValidationStatusSchema>;
type WorkerExportLease = z.infer<typeof workerExportLeaseSchema>;
type WorkerExportStatus = z.infer<typeof workerExportStatusSchema>;
type ReusedWorkerExport = z.infer<typeof reusedWorkerExportSchema>;
export interface WorkerValidationOperations {
  begin(raw: unknown): Promise<WorkerValidationLease>;
  status(raw: unknown): Promise<WorkerValidationStatus>;
  complete(raw: unknown): Promise<WorkerValidationStatus>;
  cancel(raw: unknown): Promise<WorkerValidationStatus>;
}
export interface WorkerExportOperations {
  begin(raw: unknown): Promise<WorkerExportLease | ReusedWorkerExport>;
  status(raw: unknown): Promise<WorkerExportStatus>;
  complete(raw: unknown, uploaded?: Uint8Array): Promise<WorkerExportStatus>;
  cancel(raw: unknown): Promise<WorkerExportStatus>;
}
