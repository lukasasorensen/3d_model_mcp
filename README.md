# 3d_model_mcp

Authenticated conversational CAD using React, MCP tools, PostgreSQL, and OpenSCAD.

## Workspace

This repository is a pnpm workspace targeting Node.js 22 or newer. The package
boundaries intentionally separate browser-safe contracts from Node-only model,
renderer, MCP, gateway, and runtime concerns.

```text
apps/site              React/Next.js application shell
packages/contracts     browser-safe shared contracts
packages/model-project PostgreSQL schema plus project/revision domain boundary
packages/renderer      legacy bounded STL/3MF codecs
packages/mcp           transport-neutral MCP boundary
packages/gateway       chat and provider orchestration boundary
packages/runtime       local combined-process boundary
```

OpenSCAD runs in the browser as a pinned WebAssembly module. A fresh Web Worker mounts the
pinned BOSL2 source bundle, renders with the Manifold backend, and is terminated after each
job. PostgreSQL stores owner-scoped canonical OpenSCAD source and revision history; generated STL
previews and 3MF downloads remain in the browser.

Install, migrate the database, provision an invite-only account, and verify the workspace:

```bash
pnpm install --frozen-lockfile
pnpm db:migrate
RJLS_AUTH_ALLOW_SIGNUP=1 RJLS_INITIAL_PASSWORD='a-long-initial-password' pnpm auth:provision -- user@example.com "Demo User"
pnpm verify
```

## Database development workflow

Drizzle ORM provides the typed PostgreSQL query layer, while Drizzle Kit turns
the TypeScript schema into versioned SQL migrations. Schema definitions live in
`packages/model-project/src/schema/`, with one table or enum per file and
`schema.ts` acting only as the public barrel.

For an intentional schema change:

1. Update the relevant schema file.
2. Generate and review the migration:

   ```bash
   pnpm --filter @rjls/model-project db:generate
   ```

3. Update the PostgreSQL persistence and repository layers. HTTP routes should
   remain thin: authenticate, validate input, call the repository or runtime,
   and translate known domain errors into responses.
4. Add tests for the behavior, including ownership isolation and both repository
   implementations when the contract applies to both.
5. Apply the migration to the development database and verify the workspace:

   ```bash
   pnpm db:migrate
   pnpm verify
   ```

Commit the generated SQL file, `drizzle/meta/*_snapshot.json`, and
`drizzle/meta/_journal.json` together. These files are the migration history and
should not be edited by hand. Production migrations should run as a controlled
deployment step before application code begins relying on the new schema.

## Test the MCP tools with Codex

This workflow uses Codex as the MCP client, so model reasoning uses the ChatGPT
account signed into Codex instead of an API key in this application. OpenSCAD,
BOSL2, and generated previews remain local while project history is stored in PostgreSQL. The site chat stays
on the deterministic `mock` provider and is not involved.

Codex supports local stdio MCP servers and shares their configuration across the
ChatGPT desktop app, Codex CLI, and IDE extension. Confirm that Codex is using
your ChatGPT subscription:

```bash
codex login status
# If needed:
codex login
```

Create `apps/site/.env.local` from `.env.example`. The site and MCP server use the
same database; the stdio server is explicitly bound to an existing account ID:

```dotenv
DATABASE_URL=postgres://postgres:postgres@localhost:5432/rjls
BETTER_AUTH_URL=http://localhost:3000
BETTER_AUTH_SECRET=replace-with-at-least-32-random-characters
RJLS_ALLOWED_ORIGIN=http://localhost:3000
RJLS_CHAT_PROVIDER=mock
RJLS_LOCAL_MCP_BRIDGE=1
RJLS_LOCAL_BRIDGE_ROOT=/absolute/path/to/3d_model_mcp/.rjls-local-bridge
RJLS_ACTOR_USER_ID=the-provisioned-better-auth-user-id
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
DATABASE_URL = "postgres://postgres:postgres@localhost:5432/rjls"
RJLS_LOCAL_BRIDGE_ROOT = "/absolute/path/to/3d_model_mcp/.rjls-local-bridge"
RJLS_ACTOR_USER_ID = "the-provisioned-better-auth-user-id"
```

Project-scoped configuration is loaded only for trusted repositories.

### Global registration

Register the server in `~/.codex/config.toml` with the CLI:

```bash
codex mcp add rjls-cad \
  --env DATABASE_URL=postgres://postgres:postgres@localhost:5432/rjls \
  --env RJLS_ACTOR_USER_ID=the-provisioned-better-auth-user-id \
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

Open [http://localhost:3000](http://localhost:3000), sign in, create a project, then start a new local Codex
task in this repository and ask:

> Using the `rjls-cad` MCP tools and the project ID shown in the workspace, inspect the current
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

## Remote Codex connection (deployed application)

Remote MCP is opt-in: set `RJLS_REMOTE_MCP_ENABLED=1` only after applying the
committed migrations and provisioning a public OAuth client. The existing stdio
configuration above remains separate and unchanged.

```bash
pnpm db:migrate
pnpm oauth:provision -- http://127.0.0.1/callback
```

Use the same database and public-origin environment as the deployed application.
Provisioning prints the public client ID `rjls-codex`; it creates no client secret.
The callback must be an exact HTTP loopback URL. Repeating provisioning is safe;
additional exact callbacks are added without wildcard matching.

On your Codex computer:

```bash
codex mcp add rjls-cad-remote --url https://YOUR-CAD-DOMAIN/mcp --oauth-client-id rjls-codex
codex mcp login rjls-cad-remote --scopes cad:tools,offline_access
```

If Codex reports a different callback URL, provision that exact URL and retry.
Set `tool_timeout_sec = 120` in `[mcp_servers.rjls-cad-remote]` in your Codex
configuration and restart Codex. Sign in through the browser and approve access
to your own projects. Public registration and client-secret authentication are
not used. See [Codex MCP configuration](https://learn.chatgpt.com/docs/extend/mcp?surface=cli).

Create/open a project on the deployed website and keep its tab visible. Give
Codex the project ID shown in the workspace, then request inspection, source
changes, validation, and promotion. Jobs wait fifteen seconds for a browser;
rendering retains its sixty-second WASM limit and a ninety-second server deadline.
After a timeout or cancellation, the current revision stays unchanged. Create a
new candidate to retry. Mesh downloads remain website actions; `export_model`
returns source/export metadata and does not save a file on the Codex computer.

The website’s **Connected Apps** page revokes an authorization and its refresh
tokens. Subsequent MCP requests fail immediately, including requests using a
previously issued access token; already-running operations may finish. Access
tokens last five minutes and refresh tokens thirty days. Token verifiers are
hashed and JWT signing keys encrypted with the stable `BETTER_AUTH_SECRET`.
Never put database credentials, an actor user ID, or this secret in Codex config.

The API is `POST /mcp`; OAuth discovery is exposed at
`/.well-known/oauth-protected-resource/mcp` (also the root alias) and
`/.well-known/oauth-authorization-server/api/auth`. Browser render claiming uses
an authenticated same-origin POST scoped to the owner and project. The existing
production completion endpoint verifies the single-use token, tab session,
source hash, deadline, and pinned renderer provenance.

Set `RJLS_REMOTE_MCP_ENABLED=0` and restart the application to disable remote MCP
without disabling website chat. Retain the additive schema on rollback. The
sibling deployment repository’s Proxmox runbook covers Compose, provisioning,
tunnel acceptance tests, and rollback. No additional network ports or renderer
service are required.
