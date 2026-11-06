import {
  createProjectDatabase,
  type ProjectDatabase,
} from "@theoryfoundry/model-project";
import { createModelExportService } from "./cadWorkflow.composition.js";
import { AiCompanionRelayRepository } from "./infrastructure/ai/index.js";

let database: ProjectDatabase | undefined;

export function getProjectDatabase(): ProjectDatabase {
  if (database) return database;
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString)
    throw new Error("DATABASE_URL is required for project persistence.");
  const configuredMax = Number.parseInt(
    process.env.THEORYFOUNDRY_DATABASE_POOL_MAX ?? "5",
    10,
  );
  database = createProjectDatabase(connectionString, {
    max:
      Number.isSafeInteger(configuredMax) && configuredMax > 0
        ? configuredMax
        : 5,
  });
  const current = database;
  const exports = createModelExportService(current);
  const aiRelay = new AiCompanionRelayRepository(current.pool);
  let cleaning = false;
  const cleanup = async (): Promise<void> => {
    if (cleaning) return;
    cleaning = true;
    try {
      const results = await Promise.allSettled([
        exports.cleanup(),
        aiRelay.cleanup(),
      ]);
      if (results.some((result) => result.status === "rejected"))
        throw new Error("Temporary storage cleanup unavailable.");
    } catch {
      process.stderr.write("Temporary storage cleanup unavailable.\n");
    } finally {
      cleaning = false;
    }
  };
  void cleanup();
  const cleanupTimer = setInterval(() => {
    void cleanup();
  }, 60_000);
  cleanupTimer.unref();
  const closeDatabase = current.close;
  current.close = (): Promise<void> => {
    clearInterval(cleanupTimer);
    return closeDatabase();
  };
  const shutdown = (): void => {
    void current.close().catch(() => {
      process.stderr.write("Project database shutdown failed.\n");
    });
  };
  process.once("SIGTERM", shutdown);
  process.once("SIGINT", shutdown);
  return database;
}
