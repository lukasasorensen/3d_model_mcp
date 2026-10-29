# Coolify deployment

This repository can build the application, database migrations, and operator tools
without the sibling deployment repository. Use `Dockerfile` and
`compose.coolify.yaml`; `compose.local.yaml` is only for local development.

The stack has PostgreSQL 18.6, a one-shot `migrate` service, and the `app` service.
The app starts only after PostgreSQL is healthy and migrations exit successfully.
`migrate` uses the Dockerfile's `tooling` image, which also supports account and
OAuth provisioning. Only `app` receives a public domain. OpenSCAD/BOSL2 render in
the browser; no separate renderer service or stdio MCP container is required.

## Before deployment

For an existing installation, back up its database and record its PostgreSQL
major version, application revision, and stable `BETTER_AUTH_SECRET` before
changing anything. Existing volume names are not adopted automatically. The
sibling deployment and this stack both use PostgreSQL 18.6. This stack mounts
`postgres18-data` at `/var/lib/postgresql`, allowing the image to use its default
versioned PGDATA directory. The volume name deliberately differs from the earlier
Coolify PostgreSQL 17 volume (`postgres-data`); this is not an in-place major
upgrade. An earlier Coolify installation must be backed up and restored into the
new volume before traffic is switched. Keep the old volume until acceptance.

Preserve accounts/projects by logically restoring into a separate fresh database,
not by attaching the old production volume. Follow
[the existing-installation restore plan](coolify-database-migration.md) before
starting the new app or changing traffic. The old application's files, database
and environment remain available for recovery.

Leave the existing installation and traffic routing in place until the new stack
has passed acceptance. This guide does not authorize a production cutover.

## Coolify configuration

1. Connect the target Docker server in Coolify and select a project/environment.
2. Add a Git-based application from this repository, using the Git App or deploy
   key appropriate for repository access. Select the reviewed branch/commit.
3. Choose **Docker Compose** as the build strategy. Set the base directory to `/`
   and the Compose location to `/compose.coolify.yaml`.
4. Load the Compose definition and enter its environment variables below.
5. Assign a domain only to **app**, targeting internal port **3000**. For example,
   `https://cad.example.com:3000` in Coolify's domain field routes normal public
   HTTPS to port 3000 inside the container. Application origin variables below
   must be `https://cad.example.com`, without `:3000` or a trailing slash.
6. Review storage, networks, and Compose health checks before the first deploy.
   Leave automatic deployments disabled until initial acceptance is complete.

The stack deliberately has no host port bindings, fixed container names, absolute
host build paths, or explicit volume names. Coolify supplies proxy labels and its
resource-specific Compose project name. Do not enable a raw deployment mode that
omits Coolify's proxy configuration. The app's `edge` network must be reachable
by the Coolify proxy; verify Coolify's rendered network attachments after parsing.
The database and migration service use only the internal `data` network.

For a publicly reachable server, point DNS at the server and configure the
Coolify proxy's HTTPS routing. For a homelab behind Cloudflare Tunnel, route the
chosen hostname to the Coolify proxy using a reachable origin and preserve the
public hostname. Configure TLS appropriately for that tunnel origin. Do not
reuse the old `http://3dai:3000` tunnel target: this stack has a different service
and network. Keep tunnel credentials outside this repository. Confirm streaming
SSE/MCP responses work through the chosen proxy/tunnel path.

Official references: [Docker Compose](https://coolify.io/docs/applications/builds/docker-compose)
and [environment variables](https://coolify.io/docs/applications/configuration/environment-variables).

## Environment variables

Enter these in the Coolify resource. They are runtime values passed explicitly
by Compose, not Docker build arguments. Do not upload `apps/site/.env.local` or
commit a production environment file.

| Variable                           | Value                                                                                                             |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `POSTGRES_USER`                    | `theoryfoundry` by default                                                                                        |
| `POSTGRES_DB`                      | `theoryfoundry` by default                                                                                        |
| `POSTGRES_PASSWORD`                | Required; generate with `openssl rand -hex 32`                                                                    |
| `BETTER_AUTH_SECRET`               | Required; generate with `openssl rand -hex 32` for a new installation; preserve the existing value when migrating |
| `BETTER_AUTH_URL`                  | Exact public HTTPS origin, such as `https://cad.example.com`                                                      |
| `THEORYFOUNDRY_ALLOWED_ORIGIN`     | Same exact origin as `BETTER_AUTH_URL`                                                                            |
| `THEORYFOUNDRY_REMOTE_MCP_ENABLED` | `0` initially; enable after OAuth client provisioning                                                             |
| `THEORYFOUNDRY_DATABASE_POOL_MAX`  | `5` by default                                                                                                    |

Compose constructs `DATABASE_URL` with the internal hostname `postgres`. Use a
hexadecimal database password so it is safe in a connection URL without escaping.
The signup route stays disabled and the chat provider stays `mock`. Production
does not use `THEORYFOUNDRY_ACTOR_USER_ID` or the local MCP bridge. Remote MCP
provides the authenticated AI-client workflow; this setup does not add a real
LLM provider to website chat.

The Docker build excludes environment files, Git metadata, local credentials,
generated renderer assets, local exports, and build outputs. It installs the
pinned pnpm version, runs installer/boundary/lint/type/test/build checks, fetches
the pinned renderer sources, and packages the Next.js standalone output. The
Git-dependent template identity check runs as part of `pnpm verify` in the
checkout rather than inside Docker. Docker Compose configuration tests require
the Compose CLI and skip inside an image without that CLI. Builds need network
access to the package registry and pinned renderer download hosts.

## First deployment and operator commands

After deployment is explicitly approved, select **Deploy**. Inspect the migration
logs first. A successful one-shot migration container exits with code 0; it is
not a web service and should not be given a domain or readiness URL. A failed
migration must prevent a new app container from starting. Do not bypass that
dependency to make a deployment green. Confirm how your installed Coolify version
reports the completed migration service during the first deployment.

For operator commands, SSH to the deployment server and identify the **rendered
Compose file, generated environment file, and project name** from this resource's
Coolify deployment logs/configuration. Use those exact values, not a new clone's
Compose project defaults. Run commands in the deployed checkout directory so
relative build paths resolve correctly. The generated files contain secrets;
do not print or paste them into chat or issue trackers.

Define a shell function with those actual paths/name:

```bash
cad_compose() {
  docker compose --project-name '<coolify-project-name>' \
    --env-file '<absolute-generated-env-file>' \
    -f '<absolute-rendered-compose-file>' "$@"
}
```

Verify `cad_compose ps -a` identifies this deployment before proceeding. Operator
commands reuse the already-built migration image; the minimal app image does
not contain pnpm or migration tooling.

Provision the initial account without saving its password in shell history:

```bash
read -r -s -p 'Initial password (at least 12 characters): ' THEORYFOUNDRY_INITIAL_PASSWORD
printf '\n'
export THEORYFOUNDRY_INITIAL_PASSWORD
cad_compose run --rm --no-deps --pull never \
  -e THEORYFOUNDRY_AUTH_ALLOW_SIGNUP=1 \
  -e THEORYFOUNDRY_INITIAL_PASSWORD \
  migrate pnpm auth:provision -- you@example.com 'Your Name'
unset THEORYFOUNDRY_INITIAL_PASSWORD
```

For remote MCP, provision the **exact loopback callback URL used by the client**:

```bash
cad_compose run --rm --no-deps --pull never migrate \
  pnpm oauth:provision -- '<exact-Codex-loopback-callback-url>'
```

Then set `THEORYFOUNDRY_REMOTE_MCP_ENABLED=1` in Coolify and redeploy. Keep the auth
secret stable: it also protects OAuth signing keys. Use the website's guided
**Connect to Codex** flow, described in the repository README.

## Acceptance

- Confirm `postgres` and `app` are healthy and `migrate` exited with code 0.
- Confirm `https://cad.example.com/v1/readiness` returns HTTP 200.
- Sign in, create a project, and refresh to verify persistence.
- Keep the project tab visible; validate and promote a model in the browser.
- If remote MCP is enabled, complete OAuth, inspect/edit a project, request a
  preview, and download an export. Verify live updates and streaming through
  the public proxy/tunnel, including recovery after a closed browser tab.
- Restart the app and confirm existing projects remain accessible.

Local Compose parsing or an image build alone does not prove Coolify routing,
TLS, authenticated browser behavior, or remote MCP acceptance.

## Persistence, updates, and rollback

PostgreSQL uses `postgres18-data` at `/var/lib/postgresql`. Private temporary
exports use `export-data` at `/var/lib/theoryfoundry/exports`. Keep one app replica;
multiple replicas require shared export storage and separate validation. The
runtime runs as UID/GID 1001; a newly created export volume inherits its directory
ownership. Imported export storage must be writable by that user. Exports are
temporary and are not substitutes for database backups.

Before upgrades, take a database backup and copy it off the deployment server:

```bash
umask 077
cad_compose exec -T postgres sh -c \
  'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' \
  > theoryfoundry-before-upgrade.dump
```

Check the command's exit status and test restoration into a separate disposable
database before relying on the backup. Retain the stable auth secret separately
in your password manager. Never commit backups. Keep PostgreSQL major upgrades
separate from application upgrades.

Deploy a reviewed application commit through Coolify; its migration service runs
before the new app starts. This gate is not a zero-downtime migration strategy:
old app containers may still be running while migrations execute, so migrations
must remain compatible or require a planned maintenance window.

For application rollback, select the previously verified commit/image while
retaining the database and volumes. A rollback does not undo SQL migrations;
confirm backward compatibility first. Database restore requires a separately
reviewed recovery procedure and downtime. Never use `docker compose down -v`
or delete Coolify storage as part of an application rollback.
