# Preserve an existing database when moving to Coolify

Use this plan for the existing sibling Compose deployment and a new Coolify
application on the same VM. These are operator steps, not automatic behavior of
`pnpm db:migrate`. Do not run them against the old production database.

## Preparation

1. Keep the old stack running during preparation. Disable automatic deployment
   on the new Coolify application and leave production tunnel/DNS routing alone.
2. Create a custom-format `pg_dump` backup and copy it off the VM. A successful
   `pg_restore --list` checks only the archive catalog; rehearse restoration into
   a disposable PostgreSQL 18 database before scheduling cutover.
3. Set the new Coolify application's PostgreSQL username/database/password and
   exact public origins. Preserve the old `BETTER_AUTH_SECRET`; copying this
   secret alone does not copy accounts or projects. Do not provision duplicates.
4. Use the reviewed PostgreSQL 18.6 Compose configuration. The old database is
   `rjls-cad-postgres-1`, with `rjls-cad_postgres-data` mounted at
   `/var/lib/postgresql`. The new stack uses a separate Coolify-scoped
   `postgres18-data` volume. Confirm actual containers and mounts before changes.
5. Identify the new resource's rendered Compose file, generated environment file,
   and Compose project name. Follow the `cad_compose` function in the
   [Coolify runbook](coolify-deployment.md). Verify it refers to the new remote-VM
   resource, not the old `rjls-cad` project or the prior Coolify localhost resource.

If Coolify has not prepared these generated files yet, stop here and prepare the
new stack's database-only initialization with the operator. Do not click a full
Deploy merely to obtain containers: normal startup runs migrations and starts an
empty application before data has been restored.

## Rehearsal and final restore order

Run on the VM using the new stack's verified `cad_compose` configuration. Build
its images first if they are not already available:

```bash
cad_compose build migrate app
```

Keep the new app and migration service stopped during restoration. Start only the
new database:

```bash
cad_compose up --detach --wait postgres
```

Inspect its mounts and PostgreSQL version. The new volume must not be the old
production volume, an earlier PostgreSQL 17 volume, or a database with user data.
Do not erase or clean a populated destination to get past this check; make an
explicit recovery plan first. This plan expects a fresh target database.

Restore a verified archive into that fresh database:

```bash
backup_file=/absolute/path/to/verified-backup.dump
cad_compose exec -T postgres sh -c \
  'exec pg_restore --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
    --no-owner --no-acl --exit-on-error --single-transaction' \
  < "$backup_file"
```

`--no-owner --no-acl` assigns restored objects to the configured target role
without requiring the old deployment's roles/grants. This is appropriate for the
single-role application database; separately review installations with multiple
roles or custom grants. `--single-transaction` leaves no partial restore on
failure. It is suitable for this small demo database; review transaction/lock
limits for larger databases. Stop on any error before running migrations.

After restore, apply the new application's committed migrations using its built
tooling image, then start the app through the normal Coolify deployment flow:

```bash
cad_compose run --rm --no-deps --no-build migrate pnpm db:migrate
```

The deployment may run migrations again; already applied migrations should be
recognized by the restored Drizzle migration journal. Never remove that journal
or manually mark migrations applied to force startup.

For rehearsal, use a disposable destination and a test hostname; new writes made
there will not automatically return to the old database. For the final cutover:

1. Pause all writers to the old database, including the old app, remote/local MCP
   clients and any operator jobs. Keep the old PostgreSQL container running.
2. Take a final consistent dump after writes are paused, and copy it off the VM.
   An earlier rehearsal backup will not contain later changes.
3. Restore that final dump into a fresh final target. A target populated during
   rehearsal is not empty; choose a new target or review an explicit reset of
   only that disposable target before restoring. Never reset the old database.
4. Apply migrations and verify account/project/revision counts without publishing
   private emails, model sources, tokens, or credentials in evidence.
5. Start the new app, verify readiness, existing sign-in, project history,
   rendering and exports, then switch the production tunnel/proxy route.
6. Keep old services stopped and the old database volume intact during acceptance.
   Re-enable automatic deployment only after the migration is accepted.

## Export files and rollback

Projects, canonical model source, accounts and history are in PostgreSQL.
`rjls-cad_export-data` contains temporary generated files. A database dump does not
include them. Either copy those files separately to the new export volume with
the app stopped and UID/GID 1001 access verified, or accept that previously issued
short-lived download links can stop working and regenerate exports as needed.
Do not promise preservation of an existing download link based on a DB restore.

Keep the private old environment file, stable auth secret, original data volume,
verified dump and old release until acceptance. Before the new app accepts
writes, rollback can restart the old stack and restore its traffic route. After
new writes occur, the old database is stale: reverting traffic requires a data
reconciliation decision, not just restarting containers. Do not run two database
containers against one PostgreSQL data volume.

## Verification boundary

A Compose configuration check or synthetic restore test does not verify the
actual production backup, account sign-in, current data counts, migration
compatibility with the old release, or public tunnel route. Record those checks
separately during the real cutover.

Sources: [PostgreSQL image storage layout](https://hub.docker.com/_/postgres)
and [PostgreSQL 18 pg_restore](https://www.postgresql.org/docs/18/app-pgrestore.html).
