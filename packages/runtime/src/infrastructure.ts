import { createProjectDatabase, type ProjectDatabase } from "@rjls/model-project";

let database: ProjectDatabase | undefined;

export function getProjectDatabase(): ProjectDatabase {
  if (database) return database;
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is required for project persistence.");
  const configuredMax = Number.parseInt(process.env.RJLS_DATABASE_POOL_MAX ?? "5", 10);
  database = createProjectDatabase(connectionString, { max: Number.isSafeInteger(configuredMax) && configuredMax > 0 ? configuredMax : 5 });
  const current = database;
  const shutdown = () => { void current.close().catch(() => { process.stderr.write("Project database shutdown failed.\n"); }); };
  process.once("SIGTERM", shutdown);
  process.once("SIGINT", shutdown);
  return database;
}
