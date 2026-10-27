import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { Pool } from "pg";
import type { ProjectNotifications } from "./domains/project/index.js";
import type { schema } from "./infrastructure/index.js";
export interface ProjectDatabase {
  pool: Pool;
  db: NodePgDatabase<typeof schema>;
  notifications: ProjectNotifications;
  close(): Promise<void>;
}
