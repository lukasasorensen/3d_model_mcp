import { isBrowserRendererProvenance } from "@rjls/contracts";
import { CAD_TOOL_NAMES, createCadProvider, type ChatOrchestratorOptions } from "@rjls/gateway";
import { PostgresModelProjectRepository, VALIDATION_POLICY_VERSION, type ModelProjectStore } from "@rjls/model-project";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";

import { PostgresBrowserRenderCoordinator } from "./browser-renderer.js";
import { FilesystemBrowserRenderBridge } from "./filesystem-browser-renderer.js";
import { getProjectDatabase } from "./infrastructure.js";
import { createInMemoryCadMcpClient, type ConnectedCadMcpClient } from "./mcp-client.js";
import { RuntimeObservabilityStore } from "./observability.js";

export interface ConfiguredCadRuntime extends ChatOrchestratorOptions {
  client: ConnectedCadMcpClient;
  repository: ModelProjectStore;
  browserRenderer: PostgresBrowserRenderCoordinator;
  localBrowserRenderer: FilesystemBrowserRenderBridge;
  observability: RuntimeObservabilityStore;
  probeReadiness(): Promise<{ status: "ready"; profile: "browser-wasm" }>;
}

const runtimes = new Map<string, Promise<ConfiguredCadRuntime>>();
let sharedObservability: RuntimeObservabilityStore | undefined;

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

export function getConfiguredCadRuntime(ownerId: string): Promise<ConfiguredCadRuntime> {
  if (!ownerId) return Promise.reject(new Error("An authenticated owner is required."));
  const existing = runtimes.get(ownerId);
  if (existing) return existing;
  const configured: Promise<ConfiguredCadRuntime> = (async (): Promise<ConfiguredCadRuntime> => {
    const database = getProjectDatabase();
    const browserRenderer = new PostgresBrowserRenderCoordinator(VALIDATION_POLICY_VERSION, database.pool, ownerId);
    const repository = new PostgresModelProjectRepository({ pool: database.pool, ownerId, renderer: browserRenderer, acceptRendererProvenance: isBrowserRendererProvenance });
    const client = await createInMemoryCadMcpClient(repository);
    sharedObservability ??= new RuntimeObservabilityStore();
    const localBrowserRenderer = new FilesystemBrowserRenderBridge(resolve(process.env.RJLS_LOCAL_BRIDGE_ROOT ?? ".rjls-local-bridge"), VALIDATION_POLICY_VERSION, ownerId);
    const readiness = createObservedReadinessProbe(sharedObservability, () => probeConfiguredReadiness(client, async () => {
      const result = await database.pool.query<{ projects: string | null }>("SELECT to_regclass('public.projects')::text AS projects");
      if (result.rows[0]?.projects !== "projects") throw new Error("The project database schema is not migrated.");
    }));
    let lastReadyAt = 0;
    return {
      client,
      provider: createCadProvider(),
      browserRenderer,
      localBrowserRenderer,
      createObservabilitySink: sharedObservability.createRequestSink,
      observability: sharedObservability,
      repository,
      async probeReadiness() {
        if (Date.now() - lastReadyAt < 5_000) return { status: "ready" as const, profile: "browser-wasm" as const };
        const result = await readiness();
        lastReadyAt = Date.now();
        return result;
      },
    };
  })();
  runtimes.set(ownerId, configured);
  configured.catch(() => runtimes.delete(ownerId));
  return configured;
}
