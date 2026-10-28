export * from "./auth.composition.js";
export { PostgresBrowserRenderCoordinator } from "./browserRenderer.composition.js";
export {
  probeSystemReadiness,
  withConfiguredCadRuntime,
} from "./configuredRuntime.composition.js";
export * from "./database.composition.js";
export {
  currentOAuthGrant,
  listOAuthGrants,
  mcpResourceMetadata,
  revokeOAuthGrant,
} from "./features/authentication/index.js";
export {
  BROWSER_COMMAND_POLICY_VERSION,
  BROWSER_RENDERER_VERSION,
  BrowserRenderCompletionError,
  BrowserRenderCoordinator,
  expectedBrowserProvenance,
  sanitizeBrowserRenderCompletion,
} from "./features/browser-rendering/index.js";
export type { BrowserRenderRequest } from "./features/browser-rendering/index.js";
export {
  type ConfiguredCadRuntime,
  ConfiguredCadRuntimeManager,
  type ConfiguredCadRuntimeManagerOptions,
  createObservedReadinessProbe,
  probeConfiguredReadiness,
} from "./features/cad-session/index.js";
export {
  ObservabilityEvidence,
  type ObservabilityExporter,
  type ReferenceEnvironmentEvidence,
  type RequestObservabilitySnapshot,
  RuntimeObservabilityStore,
  type VerificationEvidenceBundle,
} from "./features/observability/index.js";
export * from "./localBrowserRenderer.composition.js";
export * from "./mcpClient.composition.js";
export * from "./oauthHttp.composition.js";
export * from "./remoteHttp.composition.js";
export * from "./remoteMcp.composition.js";
export { RUNTIME_BOUNDARY } from "./shared/runtime.constants.js";
export * from "./shared/utils/domainErrors.util.js";
export {
  REMOTE_MCP_SCOPE,
  REMOTE_MCP_TIMEOUT_MS,
  remoteMcpEnabled,
  remoteMcpIdentity,
  validateOAuthCallback,
} from "./shared/utils/remoteMcpPolicy.util.js";

export {
  browserPreviewStatus,
  claimBrowserPreview,
  completeBrowserPreview,
  updateBrowserPreviewPresence,
} from "./browserPreview.composition.js";

export * from "./cadWorkflow.composition.js";

export { ModelExportsRepository } from "@theoryfoundry/model-project";
export { handleWorkerExportRequest } from "./workerExport.composition.js";
export { handleWorkerPreviewSourceRequest } from "./workerPreviewSource.composition.js";
export { handleWorkerValidationRequest } from "./workerValidation.composition.js";

export type {
  BrowserPreviewStore,
  ModelExportsStore,
  ProjectChangeSource,
} from "@theoryfoundry/model-project";
export type { ModelExportOperations } from "./features/model-export/index.js";

export type { AuthenticatedUser } from "./features/authentication/index.js";

export type { ConnectedCadMcpClient } from "./features/mcp/index.js";
