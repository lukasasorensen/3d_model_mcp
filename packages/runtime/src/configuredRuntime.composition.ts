import { isBrowserRendererProvenance } from "@theoryfoundry/contracts";
import { createCadProvider } from "@theoryfoundry/gateway";
import {
  PostgresModelProjectRepository,
  VALIDATION_POLICY_VERSION,
} from "@theoryfoundry/model-project";
import { PostgresBrowserRenderCoordinator } from "./browserRenderer.composition.js";
import { RuntimeCadWorkflowService } from "./cadWorkflow.composition.js";
import { ConfiguredCadRuntimeManager } from "./configured-runtime-manager.js";
import {
  createObservedReadinessProbe,
  probeConfiguredReadiness,
  type ConfiguredCadRuntime,
} from "./configured-runtime.js";
import { getProjectDatabase } from "./database.composition.js";
import { LocalBrowserRenderer } from "./localBrowserRenderer.composition.js";
import { createInMemoryCadMcpClient } from "./mcp-client.js";
import { RuntimeObservabilityStore } from "./observability.js";
async function createConfiguredCadRuntime(
  ownerId: string,
): Promise<ConfiguredCadRuntime> {
  const database = getProjectDatabase();
  const browserRenderer = new PostgresBrowserRenderCoordinator(
    VALIDATION_POLICY_VERSION,
    database.pool,
    ownerId,
    database.notifications,
  );
  const repository = new PostgresModelProjectRepository({
    pool: database.pool,
    ownerId,
    renderer: browserRenderer,
    acceptRendererProvenance: isBrowserRendererProvenance,
  });
  const client = await createInMemoryCadMcpClient(
    repository,
    new RuntimeCadWorkflowService(database, repository, ownerId, "chat"),
  );
  const observability = new RuntimeObservabilityStore();
  const localBrowserRenderer = new LocalBrowserRenderer(
    database,
    ownerId,
    VALIDATION_POLICY_VERSION,
  );
  const readiness = createObservedReadinessProbe(observability, () =>
    probeConfiguredReadiness(client, async () => {
      const result = await database.pool.query<{
        projects: string | null;
        notifications: string | null;
        previews: boolean;
      }>(
        "SELECT to_regclass('public.projects')::text AS projects, to_regprocedure('notify_project_change()')::text AS notifications, EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'preview_job_changed' AND tgrelid = to_regclass('public.browser_preview_jobs') AND tgenabled <> 'D') AS previews",
      );
      if (
        result.rows[0]?.projects !== "projects" ||
        !result.rows[0]?.notifications ||
        !result.rows[0]?.previews
      )
        throw new Error("The project database schema is not migrated.");
    }),
  );
  let lastReadyAt = 0;
  return {
    client,
    provider: createCadProvider(),
    browserRenderer,
    localBrowserRenderer,
    createObservabilitySink: observability.createRequestSink,
    observability,
    repository,
    close: () => client.close(),
    async probeReadiness() {
      if (Date.now() - lastReadyAt < 5_000)
        return { status: "ready" as const, profile: "browser-wasm" as const };
      const result = await readiness();
      lastReadyAt = Date.now();
      return result;
    },
  };
}
const configuredRuntimeManager = new ConfiguredCadRuntimeManager({
  createRuntime: createConfiguredCadRuntime,
});
export function withConfiguredCadRuntime<T>(
  ownerId: string,
  operation: (runtime: ConfiguredCadRuntime) => Promise<T>,
): Promise<T> {
  return configuredRuntimeManager.withRuntime(ownerId, operation);
}
export async function probeSystemReadiness(): Promise<{
  status: "ready";
  profile: "browser-wasm";
}> {
  const database = getProjectDatabase();
  const result = await database.pool.query<{
    projects: string | null;
    notifications: string | null;
    previews: boolean;
  }>(
    "SELECT to_regclass('public.projects')::text AS projects, to_regprocedure('notify_project_change()')::text AS notifications, EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'preview_job_changed' AND tgrelid = to_regclass('public.browser_preview_jobs') AND tgenabled <> 'D') AS previews",
  );
  if (
    result.rows[0]?.projects !== "projects" ||
    !result.rows[0]?.notifications ||
    !result.rows[0]?.previews
  )
    throw new Error("The project database schema is not migrated.");
  return { status: "ready", profile: "browser-wasm" };
}
