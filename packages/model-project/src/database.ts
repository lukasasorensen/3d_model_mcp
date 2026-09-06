import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool, type PoolConfig } from "pg";

import { PostgresProjectNotifications } from "./project-notifications.js";

import { schema } from "./schema.js";

export interface ProjectDatabase {
  pool: Pool;
  db: NodePgDatabase<typeof schema>;
  notifications: PostgresProjectNotifications;
  close(): Promise<void>;
}

export function createProjectDatabase(connectionString: string, options: { max?: number } = {}): ProjectDatabase {
  if (!connectionString) throw new Error("DATABASE_URL is required.");
  const config: PoolConfig = {
    connectionString,
    max: options.max ?? 5,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  };
  const pool = new Pool(config);
  const notificationPool = new Pool({ ...config, max: 1 });
  const notifications = new PostgresProjectNotifications(notificationPool);
  let closing: Promise<void> | undefined;
  return { pool, db: drizzle(pool, { schema }), notifications, close: () => { notifications.close(); return closing ??= Promise.all([notificationPool.end(), pool.end()]).then(() => undefined); } };
}
