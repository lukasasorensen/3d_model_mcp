import type { Pool } from "pg";
import { WorkerExportWorkflow } from "./domains/worker/index.js";
import {
  WorkerExportJobsRepository,
  WorkerExportTransaction,
  issueExportReceipt,
  lockExportCapacity,
  recoverWorkerExports,
  reserveExport,
} from "./infrastructure/index.js";
import type { WorkerExportDependencies } from "./workerExport.types.js";
export class WorkerExportService {
  private readonly workflow: WorkerExportWorkflow;
  constructor(
    pool: Pool,
    ownerId: string,
    origin: string,
    dependencies: WorkerExportDependencies,
  ) {
    const jobs = new WorkerExportJobsRepository(
      pool,
      ownerId,
      (client) => {
        const tx = new WorkerExportTransaction(client, ownerId);
        return {
          activeCount: tx.activeCount.bind(tx),
          create: tx.create.bind(tx),
          find: tx.find.bind(tx),
          artifact: tx.artifact.bind(tx),
          finish: tx.finish.bind(tx),
          reserve: (input, now, leaseMs) =>
            reserveExport(client, ownerId, input, now, leaseMs),
          receipt: (row, now) =>
            issueExportReceipt(client, ownerId, row, origin, now),
          finalize: (row, bytes, now) =>
            dependencies.finalize(client, row, bytes, now),
        };
      },
      lockExportCapacity,
      recoverWorkerExports,
    );
    this.workflow = new WorkerExportWorkflow(
      jobs,
      dependencies.renderer,
      dependencies.clock,
    );
  }
  begin: WorkerExportWorkflow["begin"] = (...args) =>
    this.workflow.begin(...args);
  status: WorkerExportWorkflow["status"] = (...args) =>
    this.workflow.status(...args);
  complete: WorkerExportWorkflow["complete"] = (...args) =>
    this.workflow.complete(...args);
  cancel: WorkerExportWorkflow["cancel"] = (...args) =>
    this.workflow.cancel(...args);
}
