# Fully local TheoryFoundry edition

THE-50 adds a self-hosted website/API and PostgreSQL stack with a native rendering
worker and a skills-only plugin. No hosted TheoryFoundry account, API or project
store is required. Preserve `apps/site`, existing package identities and the nested
model-project package. Existing hosted/browser connections are independent.

## Run from a checkout

Use Node 24.21.0, pnpm 11.17.0 and Docker Desktop with Compose v2. Initial
installation/build needs internet access. The application, renderer and model
libraries are packaged for runtime use; Codex reasoning still uses its own service.

```sh
pnpm install --frozen-lockfile
pnpm build:packages
pnpm build:worker-assets
pnpm worker local start --source /absolute/path/to/3d_model_mcp --json
pnpm worker local setup
pnpm worker connect --server http://127.0.0.1:43100 --allow-loopback-http --json
pnpm worker tools --json
```

`local setup` opens the browser with a private first-account capability in its URL
fragment, never printed by the CLI or sent in page requests. Enter credentials in
the browser. Account creation is serialized with a database advisory lock and
refused after any account exists. Ordinary self-signup stays disabled. Then
`connect` prepares the renderer and authorizes the worker against the local issuer.
Use `--account` to select a particular existing account explicitly.

The default port is 43100. Choose a free `--port` on first start; the origin stays
fixed afterward. `THEORYFOUNDRY_LOCAL_HOME` selects a separate installation.
`THEORYFOUNDRY_CONNECTION_HOME` can separately select the CLI connection profile.
The CLI refuses remote Docker contexts and pins the inspected local Unix socket.

The current release set is application/plugin **0.8.0**, worker/contracts/gateway **0.3.0**,
runtime **0.7.0**, MCP **0.2.0**, PostgreSQL **18**. Packaged image names are
`theoryfoundry/local-app:0.8.0` and `theoryfoundry/local-tooling:0.8.0`. They can be
loaded from reviewed image archives or built from the explicit checkout with
`--source`. Nothing publishes images, npm packages or plugins automatically.

## Skill and artifacts

```sh
pnpm pack:worker
pnpm pack:local-plugin
pnpm pack:local-images
```

The local plugin ZIP/catalog is under `dist/local-plugin/`; the worker tarball is
under `dist/packages/`. `pack:local-images` builds both application targets, pulls
the pinned PostgreSQL image and saves an offline-loadable image archive plus the
release manifest under `dist/local-edition/`. It requires local Docker and does not
publish anything. For pre-publication testing, install the tarball into an
external directory and set `THEORYFOUNDRY_LOCAL_CLI` to its absolute `dist/cli.js`.
The plugin checks that candidate's version. Otherwise it requests the exact npm
release, never `latest`. Invoke `$theoryfoundry-local` after installing/reloading
the plugin in the client. It contains no bundled MCP registration or lifecycle hooks.

The same-chat CLI uses the existing stdio worker through the official MCP SDK:

```sh
printf '{}\n' > /absolute/projects.json
pnpm worker call list_projects --input-file /absolute/projects.json --json
pnpm worker call get_model_preview --input-file /absolute/preview.json --output /absolute/preview.png --json
pnpm worker call export_model --input-file /absolute/export.json --output /absolute/model.3mf --json
```

Use `tools` for live schemas. Inputs and output locations must be explicit. Tool
errors exit nonzero; diagnostics use stderr; PNG data is not dumped into JSON.
Exports stay on the configured origin, reject redirects, have bounded downloads,
and must match the receipt's byte count and SHA-256. Existing files are preserved.
The per-command worker closes after each invocation; the app remains available.

## State, security and networking

The installation JSON and connection profile contain only nonsecret metadata.
Stable database/authentication/setup/AI-encryption secrets are kept in the OS store,
not an `.env` file. Docker receives them in the service environment; local Docker
operators can inspect container configuration. Do not share Docker inspection output.
Back up the stable secrets with the encrypted snapshot, rather than regenerating
them after losing the OS store.

Each installation has unique Compose project and volume names. The first start
initializes an empty erasure journal and records that initialization; subsequent
starts never replace a missing marker. It never adopts the
development PostgreSQL 17 volume or production data. A small fixed-upstream HTTP gateway is published on IPv4 loopback. The application,
database and migration services use only an internal network, preventing application
egress. The gateway forwards only to the app, validates Host/Origin and preserves
streaming/cancellation; it does not receive installation secrets. Docker Desktop
requires the gateway because publishing an internal-only container is unreachable
from the host. Actual localhost access and app egress denial are acceptance gates. No remote feature-flag server or external AI provider is needed for
CLI CAD. Cloud AI connections are optional and require deliberate configuration.

HTTP cookies and MCP origins are relaxed only when the explicit local-edition flag
selects matching canonical loopback HTTP origins. Public production HTTPS policy is
unchanged. Cookie authentication, ownership checks, OAuth PKCE/consent, credential
rotation, worker route gates, leases, idempotency and renderer hashes remain active.

## Backup, restore and upgrades

`local stop` preserves all volumes. `local logs --json` returns a bounded diagnostic
tail with known credentials/query capabilities redacted; never publish raw logs.

```sh
pnpm worker local backup --output /absolute/local.tfbackup
THEORYFOUNDRY_LOCAL_HOME=/absolute/restored pnpm worker local restore --input /absolute/local.tfbackup --port 43101
THEORYFOUNDRY_LOCAL_HOME=/absolute/restored pnpm worker local start
```

Run these in a terminal to enter a hidden passphrase, at least 12 characters.
AES-256-GCM authenticates the backup before restoration; scrypt derives its key.
The encrypted payload includes a cold physical PostgreSQL 18 snapshot, exports,
erasure journal, release metadata and installation secrets. Maximum compressed
snapshot size is 256 MiB; larger stores need an operator-managed backup procedure.
Keep the passphrase independently; it cannot be recovered from the backup.
Backup leaves all services stopped. Restore requires an empty installation home
and the exact original images/worker; it creates fresh volume names and never
overwrites the source. Start explicitly and reauthorize the restored origin.

`local upgrade --release <manifest> --output <encrypted-backup>` prepares the new
images, makes a cold encrypted backup, persists the selected release as pending,
and only clears the marker after migrations/readiness pass. Release manifests pin
both images and a compatible worker, and retain PostgreSQL major 18. On failure,
services remain stopped. Restore into an empty home instead of running older code
against a possibly migrated database. Start and restore require the manifest’s exact worker. For an upgrade that changes
the worker version, invoke the new pinned worker with `local upgrade`; it backs up
the previous release before migrating. Downgrades and PostgreSQL-major conversion
require a separately tested restore/migration procedure.

Lifecycle operations use an exclusive directory lock. Following a crash, stop all
local lifecycle processes before removing only the stale `operation.lock` directory.
Worker credential locks remain separate and retain their existing recovery rules.

## Verification and distribution

First target: Codex on Apple Silicon macOS. Other platforms/client journeys remain
unverified until exercised. Automated fixtures are not Docker/native-client acceptance.
See `docs/local-edition-verification.md` for the actual evidence and remaining gates.
Run focused lifecycle/auth/artifact checks, packed external acceptance and `pnpm verify`.
Public npm/images/plugin publication and the existing OpenSCAD distribution gate
remain separate. This implementation does not deploy or alter the hosted service.
