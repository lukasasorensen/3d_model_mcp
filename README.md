# 3d_model_mcp

Authenticated conversational CAD using React, MCP tools, PostgreSQL, and OpenSCAD.

## Workspace

This repository is a pnpm workspace targeting Node.js 24 (pinned in `.node-version`). The package
boundaries intentionally separate browser-safe contracts from Node-only model,
renderer, MCP, gateway, and runtime concerns.

```text
apps/site              React/Next.js application shell
packages/contracts     browser-safe shared contracts
packages/runtime/model-project PostgreSQL schema and project/revision domain boundary
packages/browser-renderer browser rendering, mesh and provenance capabilities
packages/renderer      bounded STL/3MF codecs
packages/mcp           transport-neutral MCP boundary
packages/gateway       chat and provider orchestration boundary
packages/runtime       local combined-process boundary
packages/worker-auth   private local-worker OAuth and OS credential lifecycle
```

OpenSCAD runs in the browser as a pinned WebAssembly module. A fresh Web Worker mounts the
pinned BOSL2 source bundle, renders with the Manifold backend, and is terminated after each
job. PostgreSQL stores owner-scoped canonical OpenSCAD source and revision history; generated previews stay in the browser; requested MCP exports use temporary server storage.

## Run everything locally

[Install, configure PostgreSQL, provision an account and start the site](docs/local-development.md#run-everything-locally).

## Deploy with Coolify

Use the repository-owned `Dockerfile` and `compose.coolify.yaml` for a Git-based
Coolify deployment. The stack includes private persistent PostgreSQL, a migration
startup gate, and the Next.js app. Follow [the Coolify runbook](docs/coolify-deployment.md)
for environment settings, domains, account/OAuth provisioning, and acceptance.
Existing VM deployments require a separate data and traffic migration plan.

## Upgrading an existing installation after the rename

[Preserve existing data and update configuration](docs/local-development.md#upgrading-an-existing-installation-after-the-rename).

## Database development workflow

[Make intentional schema changes and review migrations](docs/local-development.md#database-development-workflow).

## Test the MCP tools with Codex

[Register the local stdio server and use the browser renderer](docs/mcp-clients.md#test-the-mcp-tools-with-codex).

## Chat orchestration

[Chat contracts, mock provider and feature flags](docs/cad-operations.md#chat-orchestration).

## Release status

Stages 1–6 are merged; stage 7 completes architecture/convention enforcement and
documentation. Node 24 and the toolchain upgrade remain separate in THE-31.
See the [alignment plan](docs/alignment-plan.md) and [development checks](docs/development-workflow.md).

Authenticated local browser acceptance is recorded in
[site presentation alignment](docs/site-presentation-alignment.md). This evidence
does not imply production deployment or external Codex/OAuth client acceptance.
Live-provider evaluation and the license/third-party notice decision remain separate
release gates; [earlier harness evidence](docs/g006-verification-evidence.json) is historical.

## Remote Codex connection (deployed application)

[Installer, OAuth provisioning and remote MCP operation](docs/mcp-clients.md#remote-codex-connection-deployed-application).

## MCP model PNG previews

[Preview views, project tools and browser availability](docs/cad-operations.md#mcp-model-png-previews).

## Recoverable validation and downloadable MCP exports

[Validation recovery, export receipts, quotas and acceptance](docs/cad-operations.md#recoverable-validation-and-downloadable-mcp-exports).

### Sidebar chat feature flags

[Configure sidebar visibility and provider selection](docs/cad-operations.md#sidebar-chat-feature-flags).

## Engineering references

- [Architecture](docs/architecture.md) and [conventions](docs/architecture-conventions.md)
- [Verification and development workflow](docs/development-workflow.md)
- [Security](docs/security.md) and [dependencies/licenses](docs/dependencies-and-licenses.md)
- [Demo script](docs/demo-script.md)

The [local worker authentication foundation](docs/local-worker-authentication.md)
provides a dedicated OAuth client and OS-backed credentials. Local stdio integration,
installable packaging, deployment and platform/client acceptance remain separate.
