import { isBrowserRendererProvenance } from "@rjls/contracts";
import { CAD_TOOL_NAMES, createCadProvider, type ChatOrchestratorOptions } from "@rjls/gateway";
import { PostgresModelProjectRepository, VALIDATION_POLICY_VERSION } from "@rjls/model-project";
import { randomUUID } from "node:crypto";

import { PostgresBrowserRenderCoordinator } from "./browser-renderer.js";
import { ConfiguredCadRuntimeManager } from "./configured-runtime-manager.js";
import { LocalBrowserRenderer } from "./local-browser-renderer.js";
import { getProjectDatabase } from "./infrastructure.js";
import { createInMemoryCadMcpClient, type ConnectedCadMcpClient } from "./mcp-client.js";
import { RuntimeObservabilityStore } from "./observability.js";

export interface ConfiguredCadRuntime extends ChatOrchestratorOptions {
  client: ConnectedCadMcpClient;
  repository: PostgresModelProjectRepository;
  browserRenderer: PostgresBrowserRenderCoordinator;
  localBrowserRenderer: LocalBrowserRenderer;
  observability: RuntimeObservabilityStore;
  close(): Promise<void>;
  probeReadiness(): Promise<{ status: "ready"; profile: "browser-wasm" }>;
}

export async function probeConfiguredReadiness(
  client: Pick<ConnectedCadMcpClient, "listTools">,
  databaseProbe: () => Promise<void> = async () => undefined,
): Promise<{ status: "ready"; profile: "browser-wasm" }> {
  const discovered = [...await client.listTools({})].sort();
  const expected = [...CAD_TOOL_NAMES].sort();
  if (JSON.stringify(discovered) !== JSON.stringify(expected)) throw new Error("Official MCP discovery did not expose the exact CAD tool surface.");
  await databaseProbe();
  return { status: "ready", profile: "browser-wasm" };
}

export function createObservedReadinessProbe(
  observability: RuntimeObservabilityStore,
  probe: () => Promise<{ status: "ready"; profile: "browser-wasm" }>,
  dependencies: { createId?: () => string; clock?: () => Date } = {},
): () => Promise<{ status: "ready"; profile: "browser-wasm" }> {
  const evidence = observability.createRequestSink();
  const createId = dependencies.createId ?? (() => `readiness-${randomUUID()}`);
  const clock = dependencies.clock ?? (() => new Date());
  return async () => {
    const requestId = createId();
    const timestamp = clock().toISOString();
    let result: { status: "ready"; profile: "browser-wasm" };
    try { result = await probe(); }
    catch (error) { evidence.probeDependency({ available: false, requestId, timestamp }); throw error; }
    if (evidence.probeDependency({ available: true, requestId, timestamp }) !== "ready") throw new Error("Runtime readiness recovery confirmation is pending.");
    return result;
  };
}

async function createConfiguredCadRuntime(ownerId: string): Promise<ConfiguredCadRuntime> {
  const database = getProjectDatabase();
  const browserRenderer = new PostgresBrowserRenderCoordinator(VALIDATION_POLICY_VERSION, database.pool, ownerId, database.notifications);
  const repository = new PostgresModelProjectRepository({ pool: database.pool, ownerId, renderer: browserRenderer, acceptRendererProvenance: isBrowserRendererProvenance });
  const client = await createInMemoryCadMcpClient(repository);
  const observability = new RuntimeObservabilityStore();
  const localBrowserRenderer = new LocalBrowserRenderer(database, ownerId, VALIDATION_POLICY_VERSION);
  const readiness = createObservedReadinessProbe(observability, () => probeConfiguredReadiness(client, async () => {
    const result = await database.pool.query<{ projects: string | null; notifications: string | null }>("SELECT to_regclass('public.projects')::text AS projects, to_regprocedure('notify_project_change()')::text AS notifications");
    if (result.rows[0]?.projects !== "projects" || !result.rows[0]?.notifications) throw new Error("The project database schema is not migrated.");
  }));
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
      if (Date.now() - lastReadyAt < 5_000) return { status: "ready" as const, profile: "browser-wasm" as const };
      const result = await readiness();
      lastReadyAt = Date.now();
      return result;
    },
  };
}

const configuredRuntimeManager = new ConfiguredCadRuntimeManager({ createRuntime: createConfiguredCadRuntime });

export function withConfiguredCadRuntime<T>(ownerId: string, operation: (runtime: ConfiguredCadRuntime) => Promise<T>): Promise<T> {
  return configuredRuntimeManager.withRuntime(ownerId, operation);
}

export async function probeSystemReadiness(): Promise<{ status: "ready"; profile: "browser-wasm" }> {
  const database = getProjectDatabase();
  const result = await database.pool.query<{ projects: string | null; notifications: string | null }>("SELECT to_regclass('public.projects')::text AS projects, to_regprocedure('notify_project_change()')::text AS notifications");
  if (result.rows[0]?.projects !== "projects" || !result.rows[0]?.notifications) throw new Error("The project database schema is not migrated.");
  return { status: "ready", profile: "browser-wasm" };
}
