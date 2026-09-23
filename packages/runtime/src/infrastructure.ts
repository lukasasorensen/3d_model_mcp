import { createModelExportService } from "./cad-workflow-service.js";
import { createProjectDatabase, type ProjectDatabase } from "@rjls/model-project";

let database: ProjectDatabase | undefined;

export function getProjectDatabase(): ProjectDatabase {
  if (database) return database;
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is required for project persistence.");
  const configuredMax = Number.parseInt(process.env.RJLS_DATABASE_POOL_MAX ?? "5", 10);
  database = createProjectDatabase(connectionString, { max: Number.isSafeInteger(configuredMax) && configuredMax > 0 ? configuredMax : 5 });
  const current = database;
  const exports = createModelExportService(current);
  let cleaning = false;
  const cleanup = async () => { if (cleaning) return; cleaning = true; try { await exports.cleanup(); } catch { process.stderr.write("Temporary export cleanup unavailable.\n"); } finally { cleaning = false; } };
  void cleanup();
  const cleanupTimer = setInterval(() => { void cleanup(); }, 60_000); cleanupTimer.unref();
  const closeDatabase = current.close;
  current.close = () => { clearInterval(cleanupTimer); return closeDatabase(); };
  const shutdown = () => { void current.close().catch(() => { process.stderr.write("Project database shutdown failed.\n"); }); };
  process.once("SIGTERM", shutdown);
  process.once("SIGINT", shutdown);
  return database;
}
