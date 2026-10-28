import { type ChatOrchestratorOptions } from "@theoryfoundry/gateway";
import type { ProjectRepository } from "@theoryfoundry/model-project";
import type {
  LocalBrowserRenderer,
  PostgresBrowserRenderCoordinator,
} from "../browser-rendering/index.js";
import { type ConnectedCadMcpClient } from "../mcp/index.js";
import type { RuntimeObservability } from "../observability/index.js";
export interface ConfiguredCadRuntime extends ChatOrchestratorOptions {
  client: ConnectedCadMcpClient;
  repository: ProjectRepository;
  browserRenderer: PostgresBrowserRenderCoordinator;
  localBrowserRenderer: LocalBrowserRenderer;
  observability: RuntimeObservability;
  close(): Promise<void>;
  probeReadiness(): Promise<{ status: "ready"; profile: "browser-wasm" }>;
}
