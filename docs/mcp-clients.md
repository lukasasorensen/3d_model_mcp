# MCP clients and connection setup

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

Complete [Run everything locally](local-development.md#run-everything-locally) first, including
starting PostgreSQL, applying migrations, and provisioning your account. Keep
your existing `BETTER_AUTH_SECRET`. The site and MCP server use the same database;
the stdio server is explicitly bound to your provisioned account ID:

```dotenv
DATABASE_URL=postgres://postgres:postgres@localhost:5432/theoryfoundry
BETTER_AUTH_URL=http://localhost:3000
BETTER_AUTH_SECRET=replace-with-at-least-32-random-characters
THEORYFOUNDRY_ALLOWED_ORIGIN=http://localhost:3000
THEORYFOUNDRY_CHAT_PROVIDER=mock
THEORYFOUNDRY_LOCAL_MCP_BRIDGE=1
THEORYFOUNDRY_ACTOR_USER_ID=the-provisioned-better-auth-user-id
```

Install dependencies, prepare the pinned browser renderer, and build the MCP
server before registering it:

```bash
pnpm install --frozen-lockfile
pnpm prepare:browser-renderer
pnpm mcp:build
```

Register the stdio server at the project level in this repository.

### Project-level registration

From the repository root, create the configuration directory:

```bash
mkdir -p .codex
```

Create `.codex/config.toml` in the repository root and add the following TOML.
If the file already exists, add these tables to it. Replace the example path
and the account ID with your local values:

```toml
[mcp_servers.theoryfoundry-cad]
command = "pnpm"
args = ["--dir", "/absolute/path/to/3d_model_mcp", "mcp:serve"]
tool_timeout_sec = 120

[mcp_servers.theoryfoundry-cad.env]
DATABASE_URL = "postgres://postgres:postgres@localhost:5432/theoryfoundry"
THEORYFOUNDRY_ACTOR_USER_ID = "the-provisioned-better-auth-user-id"
```

Project-scoped configuration is loaded only for trusted repositories.

From the repository root, confirm that Codex sees the server:

```bash
codex mcp get theoryfoundry-cad
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

> Using the `theoryfoundry-cad` MCP tools and the project ID shown in the workspace, inspect the current
> state, create or edit the requested OpenSCAD model, validate it in the open
> browser, and promote the valid candidate.

The browser claims the validation job, runs the pinned OpenSCAD/BOSL2 Web Worker,
returns a source-bound validation receipt, and displays the promoted revision on
its next one-second project refresh. If the tab is closed, hidden for too long,
or the local bridge is disabled, `validate_and_render` fails safely and the
current revision does not change.

After changing MCP/runtime source, run `pnpm mcp:build` again and restart the
Codex client or task so it launches the rebuilt process. To remove a
project-level registration, delete the `mcp_servers.theoryfoundry-cad` tables from
this repository's `.codex/config.toml`.

Official references: [Codex MCP configuration](https://learn.chatgpt.com/docs/extend/mcp?surface=cli)
and [Codex authentication](https://learn.chatgpt.com/docs/auth).

Detailed setup and the frozen R1→R2→R3→3MF script are in
[`demo-script.md`](demo-script.md). Architecture and trust boundaries are
documented in [`architecture.md`](architecture.md) and
[`security.md`](security.md). Dependency/license status is tracked in
[`dependencies-and-licenses.md`](dependencies-and-licenses.md).

## Remote Codex connection (deployed application)

For the standalone headless CAD/PNG feasibility experiment, see the
[headless renderer proof](headless-renderer-proof.md). It reuses the existing
browser renderer locally; it is not yet the public MCP worker.
The opt-in hosted validation lease API is described in
[local worker validation](local-worker-validation.md).

When remote MCP is enabled, **Connect to Codex** appears in the project workspace
and **Connected Apps**. Choose global or repository scope and copy the setup
command into a macOS/Linux terminal with Node.js 22+ and the Codex CLI on PATH.
For repository scope, run it from the Git repository root, then trust that
repository in Codex. Scope controls configuration availability, not CAD ownership
or authorization.

The command downloads `/installers/connect-codex-v1.mjs` from this application,
runs it, and removes the temporary download. The installer adds a deployment-specific
server name to `$CODEX_HOME/config.toml` (default `~/.codex/config.toml`) or the
repository's `.codex/config.toml`, preserving existing text and backing up changed
files. It sets the 120-second tool timeout and opens Codex OAuth authorization.
Conflicting entries, malformed TOML, and unsupported TOML layouts are left unchanged.
Rerunning the command is safe; failed authorization leaves the configuration
installed and prints a login retry command. Restart Codex or begin a fresh session
after setup, and keep the CAD project tab visible during rendering. The dialog
also provides a starter prompt with the current CAD project ID.

The installer is built from `tooling/codex-connect/` using
`pnpm build:codex-installer`. Commit the generated public bundle with source changes;
`pnpm test:codex-installer` (included in `pnpm verify`) checks it is current and tests
the installer. Provision the OAuth client below before offering the connection.
No database credentials, secrets, or tokens are included in the copied command.

Remote MCP is opt-in: set `THEORYFOUNDRY_REMOTE_MCP_ENABLED=1` only after applying the
committed migrations and provisioning a public OAuth client. The existing stdio
configuration above remains separate; public pnpm commands continue to launch the
root runtime composition entries.

```bash
pnpm db:migrate
pnpm oauth:provision -- http://127.0.0.1/callback
```

Use the same database and public-origin environment as the deployed application.
Provisioning prints the public client ID `theoryfoundry-codex`; it creates no client secret.
The callback must be an exact HTTP loopback URL. Repeating provisioning is safe;
additional exact callbacks are added without wildcard matching.

On your Codex computer:

```bash
codex mcp add theoryfoundry-cad-remote --url https://YOUR-CAD-DOMAIN/mcp --oauth-client-id theoryfoundry-codex
codex mcp login theoryfoundry-cad-remote --scopes cad:tools,offline_access
```

If Codex reports a different callback URL, provision that exact URL and retry.
Set `tool_timeout_sec = 120` in `[mcp_servers.theoryfoundry-cad-remote]` in your Codex
configuration and restart Codex. Sign in through the browser and approve access
to your own projects. Public registration and client-secret authentication are
not used. See [Codex MCP configuration](https://learn.chatgpt.com/docs/extend/mcp?surface=cli).

Create/open a project on the deployed website and keep its tab visible. Give
Codex the project ID shown in the workspace, then request inspection, source
changes, validation, and promotion. Jobs wait fifteen seconds for a browser;
rendering retains its sixty-second WASM limit and a ninety-second server deadline.
After a timeout or cancellation, the current revision stays unchanged. Retry the same candidate after an operational failure. `export_model` returns a
verifiable STL/3MF receipt and an expiring download link; clients retrieve the file explicitly.

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

Set `THEORYFOUNDRY_REMOTE_MCP_ENABLED=0` and restart the application to disable remote MCP
without disabling website chat. Retain the additive schema on rollback. The
sibling deployment repository’s Proxmox runbook covers Compose, provisioning,
tunnel acceptance tests, and rollback. No additional network ports or renderer
service are required.
