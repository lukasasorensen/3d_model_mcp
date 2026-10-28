# Test coverage inventory

Stage 7 inventory, 2026-10-28: **92 files across 9 projects**. Generated for this
review from `fnm exec --using 22 pnpm test:list`; run that command for the live
inventory. Every file below is discovered recursively and executed in its owning
project. Tests live under mirrored `tests/` paths, with named integration scenarios
for cross-feature behavior. No source test files or regression declarations were
removed in stage 7. The original 53-file inventory remains historical in
[alignment inventory](alignment-inventory.md).

Built-output tests still consume package builds. TypeScript site tests run with
`tsx` and are included in site typechecking. The tooling suite includes convention,
architecture, package-boundary, installer, deployment and database regressions.

The default local suite has three existing optional skips: the disabled p95 budget
experiment, the real-PostgreSQL stdio test and export concurrency test. Hosted CI
also skips the installed-Codex smoke when that CLI is unavailable. See
[development workflow](development-workflow.md) for required environment variables.
No timing, production-database or external OAuth acceptance follows from these skips.

## 3d-model-mcp (16 files)

```text
tests/tooling/architecture/architecture.policy.test.mjs
tests/tooling/architecture/architectureBaseline.policy.test.mjs
tests/tooling/architecture/baseSnapshot.repository.test.mjs
tests/tooling/architecture/checkPackageBoundaries.script.test.mjs
tests/tooling/architecture/runtimeAssets.policy.test.mjs
tests/tooling/architecture/runtimeComposition.policy.test.mjs
tests/tooling/codex-connect/configuration.adapter.test.mjs
tests/tooling/codex-connect/installer.service.test.mjs
tests/tooling/conventions/checkConventions.script.test.mjs
tests/tooling/conventions/checkTemplateLeaks.script.test.mjs
tests/tooling/conventions/legacyBaseline.policy.test.mjs
tests/tooling/conventions/sourceConventions.policy.test.mjs
tests/tooling/database/databaseShell.cli.test.mjs
tests/tooling/deployment/coolifyDeployment.integration.test.mjs
tests/tooling/headless-renderer/node/services/assetServer.service.test.mjs
tests/tooling/testing/testDiscovery.service.test.mjs
```

## @theoryfoundry/site (26 files)

```text
tests/accessibility.integration.test.ts
tests/browserRenderer.composition.test.ts
tests/features/authentication/browser/services/oauthNavigation.service.test.ts
tests/features/authentication/services/authenticateRequest.service.test.ts
tests/features/browser-rendering/browser/services/browserRenderLease.service.test.ts
tests/features/browser-rendering/controllers/localMcpRoutes.controller.test.ts
tests/features/browser-rendering/utils/localBridgePolicy.util.test.ts
tests/features/chat/browser/services/chatStream.service.test.ts
tests/features/chat/controllers/sidebarChat.controller.test.ts
tests/features/chat/services/sidebarChatFlags.service.test.ts
tests/features/exports/controllers/exportRoutes.controller.test.ts
tests/features/model-preview/browser/components/modelViewer.component.test.ts
tests/features/model-preview/browser/services/activePreview.service.test.ts
tests/features/model-preview/controllers/previewRoutes.controller.test.ts
tests/features/model-preview/utils/boundedJson.util.test.ts
tests/features/onboarding/browser/utils/codexConnectCommand.util.test.ts
tests/features/project-events/browser/services/projectEvents.service.test.ts
tests/features/project-events/services/projectEventStream.service.test.ts
tests/features/readiness/controllers/readiness.controller.test.ts
tests/features/workspace/browser/services/projectSnapshotLoader.service.test.ts
tests/features/workspace/browser/utils/workspacePresentation.util.test.ts
tests/features/workspace/browser/utils/workspaceRevision.util.test.ts
tests/features/workspace/browser/utils/workspaceState.util.test.ts
tests/features/workspace/utils/projectCreateRequest.util.test.ts
tests/foundation.integration.test.mjs
tests/projectRoutes.integration.test.ts
```

## @theoryfoundry/browser-renderer (2 files)

```text
tests/browserRenderer.factory.test.mjs
tests/features/rendering/workflows/rendering.workflow.test.mjs
```

## @theoryfoundry/contracts (1 files)

```text
tests/index.test.mjs
```

## @theoryfoundry/gateway (7 files)

```text
tests/features/chat/controllers/chat.controller.test.mjs
tests/features/chat/services/mockCadProvider.service.test.mjs
tests/features/chat/workflows/failures/cadChat.workflow.test.mjs
tests/features/chat/workflows/limits/cadChat.workflow.test.mjs
tests/features/chat/workflows/observability/cadChat.workflow.test.mjs
tests/features/chat/workflows/protocol/cadChat.workflow.test.mjs
tests/index.test.mjs
```

## @theoryfoundry/mcp (1 files)

```text
tests/mcpServer.composition.test.mjs
```

## @theoryfoundry/renderer (2 files)

```text
tests/domains/artifacts/utils/threeMf.util.test.mjs
tests/index.test.mjs
```

## @theoryfoundry/runtime (26 files)

```text
tests/cadWorkflow.composition.test.mjs
tests/canonicalJourney.integration.test.mjs
tests/canonicalPerformance.integration.test.mjs
tests/features/authentication/oauthFlow.integration.test.mjs
tests/features/authentication/workflows/remoteMcpAuthentication.workflow.test.mjs
tests/features/browser-rendering/projectNotifications.integration.test.mjs
tests/features/browser-rendering/services/browserRenderClaims.service.test.mjs
tests/features/browser-rendering/services/renderOutcome.service.test.mjs
tests/features/browser-rendering/workflows/remoteBrowserRender.workflow.test.mjs
tests/features/mcp/controllers/remoteMcp.controller.test.mjs
tests/features/mcp/previewProtocol.integration.test.mjs
tests/features/model-preview/workflows/modelPreview.workflow.test.mjs
tests/features/observability/services/observabilityEvidence.service.test.mjs
tests/features/worker/controllers/workerExport.controller.test.mjs
tests/features/worker/controllers/workerPreviewSource.controller.test.mjs
tests/features/worker/controllers/workerValidation.controller.test.mjs
tests/features/worker/exportConcurrency.integration.test.mjs
tests/features/worker/services/workerPreviewSource.service.test.mjs
tests/hostileCandidates.integration.test.mjs
tests/index.test.mjs
tests/mcpClient.composition.test.mjs
tests/modelExport.composition.test.mjs
tests/runtimeConfiguration.integration.test.mjs
tests/stdioServer.integration.test.mjs
tests/workerExport.composition.test.mjs
tests/workerValidation.composition.test.mjs
```

## @theoryfoundry/model-project (11 files)

```text
tests/domains/worker/workflows/workerExport.workflow.test.mjs
tests/domains/worker/workflows/workerValidation.workflow.test.mjs
tests/filesystemRepository.composition.test.mjs
tests/infrastructure/schema/database.schema.test.mjs
tests/infrastructure/services/fileLocks.service.test.mjs
tests/infrastructure/services/filePublication.service.test.mjs
tests/infrastructure/services/fileValidation.service.test.mjs
tests/infrastructure/services/projectNotifications.service.test.mjs
tests/infrastructure/services/workerExportJobs.service.test.mjs
tests/infrastructure/services/workerValidationJobs.service.test.mjs
tests/postgresRepository.composition.test.mjs
```
