# Local stdio worker

THE-15's private `@theoryfoundry/local-worker` package connects the shared eleven
CAD tools to hosted project persistence and a managed local Chromium renderer.
It uses the dedicated worker OAuth client and OS credential store from
[worker authentication](local-worker-authentication.md). No database credentials
or project browser tab are required by this worker.

## Repository development commands

Use Node 24.21.0 and pnpm 11.17.0. From the repository root:

```sh
pnpm install --frozen-lockfile
pnpm build:packages
pnpm build:worker-assets
pnpm exec playwright install chromium
pnpm worker:auth login https://your-server.example
pnpm worker:serve --server https://your-server.example --account <account-id>
```

Login prints the account ID to stderr. Configure an MCP client to launch the
absolute Node 24 executable with these arguments (replace all placeholders):

```json
[
  "/absolute/repository/packages/local-worker/dist/stdioServer.composition.js",
  "--server",
  "https://your-server.example",
  "--account",
  "<account-id>"
]
```

The process works from another working directory. Only JSON-RPC goes to stdout.
Initialization and tool discovery do not acquire credentials, contact the host,
launch Chromium, open a login browser or install software. The first tool call
acquires an access token through the existing credential lifecycle. Missing login
or renderer prerequisites produce tool errors; authenticate/setup separately and
retry. `get_project_state.rendererAvailability` describes this worker's local
prerequisites and queue, rather than hosted browser presence. Actual Chromium
startup and asset integrity are checked when rendering begins.

Loopback HTTP development requires `--allow-loopback-http` on both login and
serve. The hosted deployment must already provide the worker APIs, enabled remote
MCP and local worker flags, migrations and provisioned worker OAuth client. See
[validation](local-worker-validation.md), [preview source](local-worker-preview-source.md)
and [exports](local-worker-exports.md). This PR does not perform those rollout steps.

## Tool behavior and trust boundary

The tool names and input/output schemas come from one catalog in contracts.
Hosted tools retain their browser-specific guidance. Local tools describe the
local renderer and never request a visible project tab.

Ordinary project tools use authenticated hosted MCP, including project creation,
source proposals, promotion, revision listing and restoration. Each invocation
opens and closes a stateless MCP client. Hosted error results remain errors.
Requests are confined to the configured origin and supported endpoint paths,
reject redirects, acquire credentials per request, and bound response bytes and
duration. Tokens, lease capabilities and source are never printed to diagnostics.

`validate_and_render` acquires an immutable source lease, verifies the UTF-8 size,
source hash and validation policy, renders locally, and submits the result to the
host. Model rejection and operational failure remain distinct. Only the hosted
candidate record is returned; local success never promotes a candidate.

`get_model_preview` resolves the requested VALID candidate or revision through the
hosted preview-source API, checks source and renderer pins, and returns a 768px PNG
with target/source/image hashes. All seven camera views share the browser renderer.

`export_model` reuses a completed hosted export or acquires a lease, renders STL or
3MF, uploads one multipart artifact, and checks the returned receipt against the
exact uploaded bytes. The tool returns the hosted expiring download URL; it does
not save a file in the client's working directory. A lost completion response is
resolved with the lease status endpoint before reporting failure.

Chromium runs with its sandbox enabled and service workers/downloads disabled.
It can fetch only a loopback asset host, which serves a fixed file allowlist with
Host/Origin checks and CSP. The OpenSCAD glue, WASM and BOSL2 bytes must match their
existing pinned hashes. OAuth tokens and lease capabilities stay in Node; the
browser receives source and rendering parameters only. Browser profiles are
managed temporarily by Playwright. Source, meshes and artifacts are not persisted
by the worker. The shared mesh cache is bounded to eight entries and 20 MiB.

## Cancellation and lifetime

One compute operation runs at a time, with at most four pending calls. Queued
cancellation removes the call before it acquires a lease. Admitted work has a
105-second deadline, also bounded by its hosted lease deadline. Chromium launch
has a 25-second timeout and OpenSCAD retains its existing 60-second bound.

MCP cancellation, stdin EOF, SIGINT and SIGTERM abort work. Rendering cancellation
closes the managed browser, terminating its Web Worker, then recreates Chromium on
the next render. Failed startup closes partial resources. Shutdown waits for
forwarded requests and compute cleanup, then closes Chromium, the asset listener
and stdio. Cleanup uses a fresh five-second signal to release a known lease even
when the original request is cancelled. If the host is unreachable, server-side
lease expiry remains the fallback. A lost begin response cannot recover a secret
capability; wait for expiry before retrying. Abrupt process termination likewise
relies on expiry; no client can guarantee cleanup after SIGKILL.

## Verification and remaining gates

```sh
pnpm --filter @theoryfoundry/local-worker test
pnpm acceptance:local-worker
pnpm verify
```

The ordinary suite covers source/target binding, policy rejection, upload and
receipt integrity, response-loss recovery, fresh cancellation cleanup, bounded
queues, actual authenticated loopback HTTP/multipart traffic, MCP discovery and
routing, cancellation, and stdio startup/EOF outside the repository. It needs no
real account, database or Chromium installation.

The explicit acceptance harness uses real sandboxed Chromium with synthetic
hosted lease/receipt fixtures. It runs the MCP tools through the SDK and checks
validation, seven decoded PNG views, STL/3MF parsed geometry and hashes, BOSL2,
model rejection, cancellation/recovery and shutdown. It passed on macOS arm64
with Node 24.21.0. It does not establish production OAuth/API or real-client
acceptance. Chromium is installed explicitly before running this harness.

The unified `setup`/`serve`/`login`/`logout`/`doctor` CLI, versioned tarball and
external `pnpm dlx` checks are described in [installable worker](installable-worker.md).
Registry publication, supported-platform acceptance and real Codex/Claude journeys
with the project tab closed remain THE-15 release work. Production
browser/OAuth/render/export acceptance remains tracked in THE-9.
