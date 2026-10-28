# Local development and database workflow

## Run everything locally

Prerequisites: Node.js 22.9 or newer, pnpm 11.17.0, and Docker Desktop (or Docker
Engine with Docker Compose v2). Start Docker before running the database commands.
Run the following commands from the repository root.

### 1. Install and configure

```bash
pnpm install --frozen-lockfile
cp -n .env.example apps/site/.env.local
openssl rand -hex 32
```

In `apps/site/.env.local`, replace `BETTER_AUTH_SECRET` with the generated value.
Keep that value across restarts. The local database configuration is:

```dotenv
DATABASE_URL=postgres://postgres:postgres@localhost:5432/theoryfoundry
BETTER_AUTH_URL=http://localhost:3000
THEORYFOUNDRY_ALLOWED_ORIGIN=http://localhost:3000
```

Local MCP and the website coordinate rendering through the same PostgreSQL database.
Enable `THEORYFOUNDRY_LOCAL_MCP_BRIDGE=1` for the local browser claim endpoints.

Next.js loads this file automatically. The root `pnpm db:start`, `pnpm db:stop`,
`pnpm db:logs`, `pnpm db:shell`, `pnpm db:migrate`,
`pnpm auth:provision`, `pnpm oauth:provision`, and `pnpm mcp:serve` commands also
load it automatically using `dotenv-cli`; no `source` or `export` step is needed.
Existing environment variables take precedence, so explicit command-line or
deployment settings still work. These CLI commands preserve literal `$` characters
in values rather than expanding variable references. When the local file is
absent, they use the supplied environment. Direct package-level commands still
expect their environment to be supplied by the caller.

### 2. Start PostgreSQL and create the tables

```bash
pnpm db:start
pnpm db:migrate
```

`db:start` starts PostgreSQL 17 in the background and waits for its health check
before returning. It is safe to run again. The database listens only on
`127.0.0.1:5432` by default and stores its contents in the persistent Docker volume
`theoryfoundry-postgres-data`. These credentials are for local development.

If you already started the `theoryfoundry-postgres` container using the earlier manual
`docker run` command, stop it with `docker stop theoryfoundry-postgres` first. This setup
reuses its named volume. If another server uses port 5432, set a different host
port in `apps/site/.env.local` and update the connection URL to match:

```dotenv
THEORYFOUNDRY_POSTGRES_PORT=5433
DATABASE_URL=postgres://postgres:postgres@localhost:5433/theoryfoundry
```

Run `pnpm db:start` again to apply the port mapping; the existing database volume
is preserved. Then run `pnpm db:migrate` and restart the site and any standalone
MCP process so they use the updated URL. Update any explicit `DATABASE_URL` in
your local stdio MCP configuration too. PostgreSQL still uses port 5432 inside
the container, so `pnpm db:shell` requires no port changes. `pnpm db:shell` selects the database and user from `DATABASE_URL`. Use a literal port in
`DATABASE_URL`; these CLI commands do not expand references to other variables.

### 3. Create your local account

Replace the example email, name, and password, then run once per account:

```bash
THEORYFOUNDRY_AUTH_ALLOW_SIGNUP=1 THEORYFOUNDRY_INITIAL_PASSWORD='a-long-initial-password' pnpm auth:provision -- user@example.com "Demo User"
```

The command prints `Provisioned account ... with user ID ...`. Copy that ID into
`THEORYFOUNDRY_ACTOR_USER_ID` in `apps/site/.env.local` and, when registering the local MCP
server below, into its environment configuration. Use the same database and
account for the site and MCP server. The site itself gets your identity from
your signed-in session.

To look up an existing account's ID without installing `psql` on your computer:

```bash
pnpm db:shell -c 'SELECT id, email FROM "user";'
```

### 4. Start the site

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000), sign in with the account you
created, and create a project. Provisioning above builds the workspace packages;
`pnpm dev` prepares the pinned browser renderer and starts Next.js. The default
site chat uses the deterministic `mock` provider when its sidebar flag is enabled;
without Unleash configuration, the sidebar is hidden. See [chat configuration](cad-operations.md#sidebar-chat-feature-flags). To use Codex for model changes,
continue with [Test the MCP tools with Codex](mcp-clients.md#test-the-mcp-tools-with-codex)
and keep the project tab visible for browser rendering.

### Everyday commands

```bash
pnpm db:start   # Start or resume the database; wait until ready
pnpm dev        # Run the site (Ctrl+C stops it)
```

In another terminal, you can inspect or stop PostgreSQL:

```bash
pnpm db:logs    # Follow database logs (Ctrl+C exits the log viewer)
pnpm db:shell   # Open SQL prompt; enter \q to exit
pnpm db:stop    # Stop PostgreSQL while preserving accounts and projects
```

After pulling changes, run `pnpm db:migrate`
for any new migrations, and run `pnpm build:packages` to rebuild shared packages.
For the full development checks, run:

```bash
pnpm verify
```

## Database development workflow

Drizzle ORM provides the typed PostgreSQL layer. Schemas live in
`packages/runtime/model-project/src/infrastructure/schema/`, one table or enum per
file. `database.schema.ts` assembles tables and `index.ts` re-exports them.
Drizzle Kit generates versioned SQL migrations from these definitions.

For an intentional schema change:

1. Update the relevant schema file.
2. Generate and review the migration:

   ```bash
   pnpm --filter @theoryfoundry/model-project db:generate
   ```

3. Update the PostgreSQL persistence and repository layers. HTTP routes should
   remain thin: authenticate, validate input, call a feature controller through its public API,
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

## Upgrading an existing installation after the rename

Rename application environment variable prefixes to `THEORYFOUNDRY_` in local
configuration, and update MCP registrations to the identifiers shown below. The
sibling deployment repository maps its existing deployment settings to the new
application variable names; update both repositories together.
Reinstall workspace dependencies with `pnpm install --frozen-lockfile`, then run
`pnpm db:migrate` against the existing database before restarting the application.
The notification migration updates the existing trigger functions without changing
stored projects, revisions, or SQL table names. Reprovision the public OAuth client
with `pnpm oauth:provision` and reconnect Codex using `theoryfoundry-codex`.

The Compose project, default database, and volume names now use `theoryfoundry`.
For existing data, retain the original `DATABASE_URL` and explicitly configure
Compose to use the existing volume and database, or back up and restore into the
new database before switching. The new volume name does not automatically move
existing data. Filesystem repositories now store metadata under `.theoryfoundry`;
rename the previous metadata directory in each existing workspace before use.
