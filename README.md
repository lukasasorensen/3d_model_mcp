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
packages/renderer      legacy bounded STL/3MF codecs
packages/mcp           transport-neutral MCP boundary
packages/gateway       chat and provider orchestration boundary
packages/runtime       local combined-process boundary
```

OpenSCAD runs in the browser as a pinned WebAssembly module. A fresh Web Worker mounts the
pinned BOSL2 source bundle, renders with the Manifold backend, and is terminated after each
job. The server stores canonical OpenSCAD source and revision history only; generated STL
previews and 3MF downloads remain in the browser.

Install and verify the workspace:

```bash
pnpm install --frozen-lockfile
pnpm verify
```

## Test the MCP tools with Codex

This workflow uses Codex as the MCP client, so model reasoning uses the ChatGPT
account signed into Codex instead of an API key in this application. OpenSCAD,
BOSL2, project history, and generated previews remain local. The site chat stays
on the deterministic `mock` provider and is not involved.

Codex supports local stdio MCP servers and shares their configuration across the
ChatGPT desktop app, Codex CLI, and IDE extension. Confirm that Codex is using
your ChatGPT subscription:

```bash
codex login status
# If needed:
codex login
```

Create `apps/site/.env.local` from `.env.example`. Use the same **absolute** projects root
for both the site and the MCP server:

```dotenv
RJLS_PROJECTS_ROOT=/absolute/path/to/3d_model_mcp/.rjls-projects
RJLS_ALLOWED_ORIGIN=http://localhost:3000
RJLS_CHAT_PROVIDER=mock
RJLS_LOCAL_MCP_BRIDGE=1
```

Install dependencies, prepare the pinned browser renderer, and build the MCP
server before registering it:

```bash
pnpm install --frozen-lockfile
pnpm prepare:browser-renderer
pnpm mcp:build
```

Choose whether to register the stdio server for this repository only or for all
repositories. Replace both example paths in either option.

### Repository-only registration

Add the server to this repository's `.codex/config.toml`:

```toml
[mcp_servers.rjls-cad]
command = "pnpm"
args = ["--dir", "/absolute/path/to/3d_model_mcp", "mcp:serve"]
tool_timeout_sec = 120

[mcp_servers.rjls-cad.env]
RJLS_PROJECTS_ROOT = "/absolute/path/to/3d_model_mcp/.rjls-projects"
```

Project-scoped configuration is loaded only for trusted repositories.

### Global registration

Register the server in `~/.codex/config.toml` with the CLI:

```bash
codex mcp add rjls-cad \
  --env RJLS_PROJECTS_ROOT=/absolute/path/to/3d_model_mcp/.rjls-projects \
  -- pnpm --dir /absolute/path/to/3d_model_mcp mcp:serve
```

Then add `tool_timeout_sec = 120` inside the generated
`[mcp_servers.rjls-cad]` table in `~/.codex/config.toml`.

After either option, confirm that Codex sees the server:

```bash
codex mcp get rjls-cad
```

Browser rendering has a 60-second safety limit, so the MCP tool needs enough
time for the browser handoff and protocol overhead. Restart the ChatGPT desktop
app, Codex CLI session, or IDE extension after adding the server; an
already-running task does not gain newly configured tools.

Start the site and keep its tab visible while using the MCP tools:

```bash
pnpm dev
```

Open [http://localhost:3000/projects/demo-project](http://localhost:3000/projects/demo-project), then start a new local Codex
task in this repository and ask:

> Using the `rjls-cad` MCP tools and project ID `demo-project`, inspect the current
> state, create or edit the requested OpenSCAD model, validate it in the open
> browser, and promote the valid candidate.

The browser claims the validation job, runs the pinned OpenSCAD/BOSL2 Web Worker,
returns a source-bound validation receipt, and displays the promoted revision on
its next one-second project refresh. If the tab is closed, hidden for too long,
or the local bridge is disabled, `validate_and_render` fails safely and the
current revision does not change.

After changing MCP/runtime source, run `pnpm mcp:build` again and restart the
Codex client or task so it launches the rebuilt process. To remove a
repository-only registration, delete the `mcp_servers.rjls-cad` tables from
`.codex/config.toml`. To remove the global registration, run:

```bash
codex mcp remove rjls-cad
```

Official references: [Codex MCP configuration](https://learn.chatgpt.com/docs/extend/mcp?surface=cli)
and [Codex authentication](https://learn.chatgpt.com/docs/auth).

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
The chat route pauses candidate validation until the originating browser reports the result
of rendering the exact candidate source hash. Invalid code never replaces the current revision.

## Release status

The deterministic integration harness proves the server workflow with an explicit test-only
renderer fixture. Browser screenshots and heap traces, live-provider evaluation/default
selection, public deployment, and
the repository license/third-party notice decision remain blocked or deferred. See
[`docs/g006-verification-evidence.json`](docs/g006-verification-evidence.json). A2A
is a future research item and is not implemented.
