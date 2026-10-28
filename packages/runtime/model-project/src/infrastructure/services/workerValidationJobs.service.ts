import type { Pool, PoolClient } from "pg";
import type { WorkerValidationTransactionPort } from "../../domains/worker/index.js";

/** One owner lock serializes admission and capability operations across replicas. */
export class WorkerValidationJobsRepository {
  constructor(
    private readonly pool: Pool,
    private readonly createTransaction: (
      client: PoolClient,
    ) => WorkerValidationTransactionPort,
  ) {}
  async transaction<T>(
    operation: (transaction: WorkerValidationTransactionPort) => Promise<T>,
  ): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const transaction = this.createTransaction(client);
      await transaction.lockOwner();
      const result = await operation(transaction);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }
}
