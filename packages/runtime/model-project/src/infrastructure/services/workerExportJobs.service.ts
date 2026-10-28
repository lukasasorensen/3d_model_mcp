import type { Pool, PoolClient } from "pg";
import type { WorkerExportTransactionPort } from "../../domains/worker/index.js";
import { CadDomainError } from "../../shared/utils/cadDomainError.util.js";
export class WorkerExportJobsRepository {
  constructor(
    private readonly pool: Pool,
    private readonly ownerId: string,
    private readonly createTransaction: (
      client: PoolClient,
    ) => WorkerExportTransactionPort,
    private readonly lockCapacity: (client: PoolClient) => Promise<void>,
    private readonly recover: (
      client: PoolClient,
      now: Date,
      ownerId: string,
    ) => Promise<void>,
  ) {}

  async transaction<T>(
    clock: () => Date,
    operation: (
      transaction: WorkerExportTransactionPort,
      now: Date,
    ) => Promise<T>,
  ): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await this.lockCapacity(client);
      // Evaluate deadlines after waiting for locks, never from a stale pre-lock timestamp.
      const now = clock();
      await this.recover(client, now, this.ownerId);
      await client.query("SAVEPOINT worker_export_operation");
      let value: T | undefined, failure: CadDomainError | undefined;
      try {
        value = await operation(this.createTransaction(client), now);
      } catch (error) {
        if (!(error instanceof CadDomainError)) throw error;
        await client.query("ROLLBACK TO SAVEPOINT worker_export_operation");
        failure = error;
      }
      await client.query("COMMIT");
      if (failure) throw failure;
      return value as T;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }
}
