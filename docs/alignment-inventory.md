# Alignment inventory

Snapshot of `efd6b8f`, before stage 1: 374 tracked files and 53 test files.
The template reference is `26d3789`. This map preserves package and deployment boundaries;
final names within a split are reviewed with the owning stage rather than mechanically
renaming a large file into a single service. `pnpm test:list` is the live test inventory.

## Public entry points and compatibility

| Package                           | Source public entry                             | Preserve                                                    |
| --------------------------------- | ----------------------------------------------- | ----------------------------------------------------------- |
| `@theoryfoundry/contracts`        | `packages/contracts/src/index.ts`               | Browser-safe contracts and current exported symbols         |
| `@theoryfoundry/browser-renderer` | `packages/browser-renderer/src/index.ts`        | Browser renderer API, worker lifecycle and pinned assets    |
| `@theoryfoundry/renderer`         | `packages/renderer/src/index.ts`                | Artifact validation, diagnostics, STL/3MF handling          |
| `@theoryfoundry/model-project`    | `packages/runtime/model-project/src/index.ts`   | Repository and domain API; nested workspace identity        |
| `@theoryfoundry/mcp`              | `packages/mcp/src/index.ts`                     | MCP server/tool schemas, negotiation and exported factories |
| `@theoryfoundry/gateway`          | `packages/gateway/src/index.ts`                 | NDJSON/agent gateway contracts and exported factories       |
| `@theoryfoundry/runtime`          | `packages/runtime/src/index.ts`                 | Combined runtime public API and resource lifecycle          |
| `@theoryfoundry/site`             | `apps/site/src/app/**/{page,layout,route}.tsx?` | Framework paths, HTTP routes, client/server directives      |

All seven library package manifests currently expose `.` through `dist/index.js` and
`dist/index.d.ts`. Keep those entries stable while moving implementations. Runtime's
`stdio-server.ts`, `provision-user.ts` and `provision-oauth-client.ts` are operational
entry points: preserve pnpm commands and update emitted paths only in their owning stage.
The generated `apps/site/public/installers/connect-codex-v1.mjs` URL stays unchanged.

## Movement and responsibility map

Paths below are relative to the corresponding package's `src/` unless stated otherwise.
Only add folders with real responsibilities; do not add empty template examples.

| Stage / owner        | Current area                                                                                                                                                                                                  | Target responsibility / movement                                                                                                             |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| 2 / root             | `scripts/check-package-boundaries*`, `check-template-leaks*`                                                                                                                                                  | `tooling/architecture/` and `tooling/conventions/`; tests under `tests/tooling/`; retain old checks until equivalent coverage exists         |
| 2 / root             | `scripts/build-codex-installer.mjs`, `scripts/codex-connect/`                                                                                                                                                 | `tooling/codex-connect/` with role filenames; preserve generated installer bytes/check                                                       |
| 2 / root             | `scripts/database-shell*`, `scripts/coolify-deployment.test.mjs`                                                                                                                                              | `tooling/database/`, `tests/tooling/database/` and `tests/tooling/deployment/`; preserve commands                                            |
| 2 / root             | `scripts/prepare-browser-renderer.mjs`, `scripts/headless-renderer/`                                                                                                                                          | `tooling/browser-renderer/`, `tooling/headless-renderer/`; retain proof/asset and emitted CLI behavior                                       |
| 3 / contracts        | `cad-contracts.ts`, `workflow-contracts.ts`, `model-preview.ts`, `project-event.ts`, `worker/`                                                                                                                | Domain-owned data contracts and validation utilities; split CAD contracts by capability and re-export existing symbols                       |
| 3 / browser-renderer | `renderer/`, `services/`, `utils/`, `worker/`                                                                                                                                                                 | Rendering feature with lower pure mesh/provenance utilities and worker adapters; orchestration in workflows where multiple services are used |
| 3 / renderer         | `artifacts.ts`, `zip64.ts`, `diagnostics.ts`, `fixtures/`                                                                                                                                                     | Artifact domain validation and format-specific utilities; split archive/mesh parsing; preserve binary fixtures                               |
| 4 / model-project    | `repository.ts`, `store.ts`, `render-policy.ts`, `validation/`, `worker/*.service.ts`                                                                                                                         | Candidate/project/render/export domain capabilities and explicit workflows; separate orchestration from persistence                          |
| 4 / model-project    | `project-types.ts`, `cad-domain-error.ts`, `hash.ts`                                                                                                                                                          | Domain-owned types/errors and pure utilities; narrow ports alongside domain indexes                                                          |
| 4 / model-project    | `postgres-repository.ts`, `postgres-project-persistence.ts`, `database.ts`, `*.repository.ts`, `exports/`, `worker/*repository.ts`, `project-notifications.ts`                                                | Infrastructure persistence, transaction and notification adapters implementing domain ports                                                  |
| 4 / model-project    | `schema.ts`, `schema/`                                                                                                                                                                                        | Infrastructure schemas, one table/enum per role file; fresh column factories; preserve SQL names and migrations                              |
| 5 / gateway          | `orchestrator.ts`, `cad-client.ts`, `provider.ts`, `http.ts`                                                                                                                                                  | Chat workflows, provider/MCP adapters and HTTP controllers; split orchestration by cohesive operation                                        |
| 5 / mcp              | `mcp-adapter.ts`, `tools.ts`, `model-preview-tool.ts`                                                                                                                                                         | MCP transport/tool controllers and public factories; no business policy in barrels                                                           |
| 5 / runtime          | `configured-runtime*`, `infrastructure.ts`, `stdio-server.ts`, provisioning entries                                                                                                                           | Explicit composition, startup/shutdown and CLI adapters                                                                                      |
| 5 / runtime          | `cad-workflow-service.ts`, `model-export-service.ts`, `model-preview-service.ts`, `exports/`                                                                                                                  | CAD/render/export workflows and capabilities; inject narrow storage/transport ports                                                          |
| 5 / runtime          | `worker/`, `remote-mcp-*`, `oauth-*`, `auth.ts`                                                                                                                                                               | Worker/MCP/OAuth feature controllers, services and policies; preserve authorization and protocol handling                                    |
| 5 / runtime          | `*browser-renderer.ts`, `browser-preview-runtime.ts`, `mcp-client.ts`, `abortable-mcp-request.ts`, `export-file-store.ts`, `render-outcome-wait.ts`, `preview-png.ts`, `observability.ts`, `domain-errors.ts` | Cohesive transport/render/storage adapters and lower-level contracts/utilities; preserve cancellation and failures                           |
| 6 / site             | `components/ModelWorkspace.tsx`, `ModelViewer.tsx`, `ModelSourcePanel.tsx`, `RevisionHistory.tsx`, `lib/workspace-state.ts`, render/preview/event hooks                                                       | Model workspace feature components, hooks, controller adapters and pure state utilities                                                      |
| 6 / site             | `ChatPane.tsx`, sidebar-chat/stream helpers                                                                                                                                                                   | Chat feature components/hooks, stream adapters and policy                                                                                    |
| 6 / site             | `ProjectLanding.tsx`, project-create/snapshot helpers                                                                                                                                                         | Project feature components, validated requests and loading adapters                                                                          |
| 6 / site             | sign-in, connected-apps, consent, Codex connection components and helpers                                                                                                                                     | Authentication/connection feature presentation and adapters                                                                                  |
| 6 / site             | `src/app/`, route helpers in `lib/`                                                                                                                                                                           | Keep framework filenames/routes; delegate to feature controllers through public APIs                                                         |
| 3–6 / all            | Colocated `*.test.*`, `test-support/`, test-only fixtures                                                                                                                                                     | Per-project `tests/` mirrors source paths and role stems; preserve built-artifact tests and scenario coverage                                |
| 7 / root             | Large README and remaining legacy records                                                                                                                                                                     | Focused docs linked from concise README; zero formatting/naming/size/placement exceptions                                                    |
| 8 / all              | Root/package tsconfigs, ESLint, Node engine, CI, Docker                                                                                                                                                       | Node 24, compatible pinned tooling, strict source/test checking, source-only build configs                                                   |

## Test coverage inventory

The original 53 tests are distributed as follows (filenames recorded below). Existing
commands omitted `scripts/check-template-leaks.test.mjs`; root/package globs were depth
sensitive. The new runner recursively discovers these tests plus new tooling regressions,
assigns each to the closest pnpm project and uses that directory as cwd. It does not
convert built-output `.mjs` tests into source-level tests.

```text
apps/site/src/accessibility-contract.test.ts
apps/site/src/foundation.test.mjs
apps/site/src/lib/active-preview.test.ts
apps/site/src/lib/browser-render-cancellation.test.ts
apps/site/src/lib/browser-render-lease.test.ts
apps/site/src/lib/codex-connect-command.test.ts
apps/site/src/lib/oauth-navigation.test.ts
apps/site/src/lib/project-create-request.test.ts
apps/site/src/lib/project-event-client.test.ts
apps/site/src/lib/project-event-stream.test.ts
apps/site/src/lib/project-snapshot-loader.test.ts
apps/site/src/lib/sidebar-chat-flags.test.ts
apps/site/src/lib/sidebar-chat-route.test.ts
apps/site/src/routes.test.ts
apps/site/src/stream-client.test.ts
apps/site/src/workspace-state.test.ts
packages/browser-renderer/src/renderer/cad.renderer.test.mjs
packages/contracts/src/index.test.mjs
packages/gateway/src/index.test.mjs
packages/mcp/src/index.test.mjs
packages/renderer/src/artifacts.test.mjs
packages/renderer/src/large-vertex-table.test.mjs
packages/renderer/src/zip64.test.mjs
packages/runtime/model-project/src/index.test.mjs
packages/runtime/model-project/src/postgres-schema.test.mjs
packages/runtime/model-project/src/project-notifications.test.mjs
packages/runtime/model-project/src/repository-contract.test.mjs
packages/runtime/src/canonical-journey.test.mjs
packages/runtime/src/configuration.test.mjs
packages/runtime/src/index.test.mjs
packages/runtime/src/model-preview.test.mjs
packages/runtime/src/oauth-flow.test.mjs
packages/runtime/src/preview-mcp.test.mjs
packages/runtime/src/project-notifications.test.mjs
packages/runtime/src/remote-mcp-auth.test.mjs
packages/runtime/src/remote-mcp-http.test.mjs
packages/runtime/src/remote-render.test.mjs
packages/runtime/src/render-outcome-wait.test.mjs
packages/runtime/src/worker/export-concurrency.integration.test.mjs
packages/runtime/src/worker/export.http.test.mjs
packages/runtime/src/worker/export.service.test.mjs
packages/runtime/src/worker/preview-source.http.test.mjs
packages/runtime/src/worker/preview-source.service.test.mjs
packages/runtime/src/worker/validation.http.test.mjs
packages/runtime/src/worker/validation.service.test.mjs
packages/runtime/src/workflow-recovery.test.mjs
scripts/check-package-boundaries.test.mjs
scripts/check-template-leaks.test.mjs
scripts/codex-connect/configuration.test.mjs
scripts/codex-connect/installer.test.mjs
scripts/coolify-deployment.test.mjs
scripts/database-shell.test.mjs
scripts/headless-renderer/node/services/asset-server.service.test.mjs
```

## Size debt

Before formatting, four handwritten files exceed 500 physical lines: model-project's
`repository.ts` and `index.test.mjs`, contracts' `cad-contracts.ts`, and the root README.
A dry-run of the template formatter also expands runtime's canonical journey/recovery
tests, gateway's orchestrator/tests, renderer artifacts, model-project persistence,
site workspace state tests and ModelWorkspace beyond 500. Recompute after each split;
formatting can increase physical line counts. Do not increase baseline caps to absorb it.

The generated installer and Drizzle migration history are explicit artifact exceptions.
The baseline is migration metadata, not an exception for newly introduced source files.
