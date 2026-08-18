import { isBrowserRendererProvenance } from "@rjls/contracts";
import { CAD_TOOL_NAMES, createCadProvider, type ChatOrchestratorOptions } from "@rjls/gateway";
import { ModelProjectRepository, VALIDATION_POLICY_VERSION } from "@rjls/model-project";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";

import { BrowserRenderCoordinator } from "./browser-renderer.js";
import { createInMemoryCadMcpClient, type ConnectedCadMcpClient } from "./mcp-client.js";
import { RuntimeObservabilityStore } from "./observability.js";

export interface ConfiguredCadRuntime extends ChatOrchestratorOptions {
  client: ConnectedCadMcpClient;
  repository: ModelProjectRepository;
  browserRenderer: BrowserRenderCoordinator;
  observability: RuntimeObservabilityStore;
  probeReadiness(): Promise<{ status: "ready"; profile: "browser-wasm" }>;
}

let singleton: Promise<ConfiguredCadRuntime> | undefined;

export async function probeConfiguredReadiness(
  client: Pick<ConnectedCadMcpClient, "listTools">,
): Promise<{ status: "ready"; profile: "browser-wasm" }> {
  const discovered = [...await client.listTools({})].sort();
  const expected = [...CAD_TOOL_NAMES].sort();
  if (JSON.stringify(discovered) !== JSON.stringify(expected)) throw new Error("Official MCP discovery did not expose the exact CAD tool surface.");
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
    try {
      result = await probe();
    } catch (error) {
      evidence.probeDependency({ available: false, requestId, timestamp });
      throw error;
    }
    if (evidence.probeDependency({ available: true, requestId, timestamp }) !== "ready") throw new Error("Runtime readiness recovery confirmation is pending.");
    return result;
  };
}

export function getConfiguredCadRuntime(): Promise<ConfiguredCadRuntime> {
  singleton ??= (async () => {
    const browserRenderer = new BrowserRenderCoordinator(VALIDATION_POLICY_VERSION);
    const workspaceRoot = resolve(process.env.RJLS_PROJECTS_ROOT ?? ".rjls-projects");
    const repository = new ModelProjectRepository({ workspaceRoot, renderer: browserRenderer, acceptRendererProvenance: isBrowserRendererProvenance });
    const client = await createInMemoryCadMcpClient(repository);
    const observability = new RuntimeObservabilityStore();
    const readiness = createObservedReadinessProbe(observability, () => probeConfiguredReadiness(client));
    let lastReadyAt = 0;
    return {
      client,
      provider: createCadProvider(),
      browserRenderer,
      createObservabilitySink: observability.createRequestSink,
      observability,
      repository,
      async probeReadiness() {
        if (Date.now() - lastReadyAt < 5_000) return { status: "ready", profile: "browser-wasm" };
        const result = await readiness();
        lastReadyAt = Date.now();
        return result;
      },
    };
  })();
  return singleton;
}
