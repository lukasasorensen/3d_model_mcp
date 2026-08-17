# 3d_model_mcp

Local-first conversational CAD using React, MCP tools, and OpenSCAD.

## Workspace

This repository is a pnpm workspace targeting Node.js 22 or newer. The package
boundaries intentionally separate browser-safe contracts from Node-only model,
renderer, MCP, gateway, and runtime concerns.

```text
apps/site              React/Next.js application shell
packages/contracts     browser-safe shared contracts
packages/model-project project and revision domain boundary
packages/renderer      isolated rendering boundary
packages/mcp           transport-neutral MCP boundary
packages/gateway       chat and provider orchestration boundary
packages/runtime       local combined-process boundary
```

The renderer defaults to the strict `production-oci` provenance profile. A code-level
`TrustedLocalOpenScadRenderer` adapter is available only as an explicit development opt-in;
it runs the configured host OpenSCAD executable without isolation, warns on every render,
records `trusted-local-development` provenance, and the model repository refuses to promote
its artifacts even if a caller's provenance callback accepts them. `pnpm test:renderer:strict`
never falls back to this adapter and exits nonzero unless all pinned OCI/runtime prerequisites
are configured and available.

The OCI controller makes a bounded force-removal attempt for every known container ID, including
start, timeout, cancellation, and evidence-check failures. Cleanup can still fail if the daemon is
unavailable, and a daemon failure before returning an ID leaves no safe container target to remove.

Install and verify the workspace:

```bash
pnpm install --frozen-lockfile
pnpm verify
```

Detailed setup and the frozen R1→R2→R3→3MF script are in
[`docs/demo-script.md`](docs/demo-script.md). Architecture and trust boundaries are
documented in [`docs/architecture.md`](docs/architecture.md) and
[`docs/security.md`](docs/security.md). Dependency/license status is tracked in
[`docs/dependencies-and-licenses.md`](docs/dependencies-and-licenses.md).

## Chat orchestration

`POST /v1/chat` accepts the strict browser-safe v3 request contract and returns
newline-delimited v3 events. The route requires an exact `Origin` match and a
matching `x-rjls-session-id`, caps the streamed request body at 32 KiB, and
propagates disconnect cancellation through LangChain, the official MCP client,
and the renderer.

The credential-free default is `RJLS_CHAT_PROVIDER=mock`. It is deterministic
and supports the canonical blank bracket, 100 mm width edit, gusset edit, and
3MF export prompts for local demos and tests. No live-provider adapter or
default model is selected; that remains behind the provider evaluation gate.
The chat route still requires the strict OCI renderer configuration above,
because the agent cannot bypass MCP to fabricate a revision or artifact.

## Release status

The deterministic integration harness proves the implementation path with an
explicit test-only renderer fixture; it does not prove real OCI isolation or actual
OpenSCAD/BOSL2 output. Real renderer smoke/performance evidence, browser screenshots
and heap traces, live-provider evaluation/default selection, public deployment, and
the repository license/third-party notice decision remain blocked or deferred. See
[`docs/g006-verification-evidence.json`](docs/g006-verification-evidence.json). A2A
is a future research item and is not implemented.
