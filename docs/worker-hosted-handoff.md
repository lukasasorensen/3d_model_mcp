# THE-15 hosted prerequisite handoff

Observed October 29–30, 2026 against `https://3dai.theoryfoundry.com`.
Coolify application: `yjcpwok2vq6r2yeiposbbip2`.

## Verified before changes

- Coolify's automatic deployment of PR #25 completed. The running app image uses
  commit `1247df75714584418af544d26b3634d649719a1b`; the app reported healthy.
- PostgreSQL has 13 migration records. No additional migration is required for
  onboarding/cache behavior. No schema changes were made.
- Effective container flags: `THEORYFOUNDRY_REMOTE_MCP_ENABLED=1` and
  `THEORYFOUNDRY_LOCAL_WORKER_ENABLED=0`.
- Neither the dedicated worker nor Codex OAuth registration existed initially.
  Only the dedicated worker registration was needed and provisioned in this task.
- Existing PostgreSQL 18.6 volume remains
  `yjcpwok2vq6r2yeiposbbip2_postgres18-data`, mounted at `/var/lib/postgresql`.

Before provisioning, a fresh custom-format pg_dump was saved on the deployment
server as `/home/rjls/coolify-migration/THE-15-before-worker-20261029.dump`, mode 600.
SHA-256: `cb2ede0cde3b10f5dc97cac3426a425b87968d4fba01d3e915458a1866b3e641`.
`pg_restore -l` checked its catalog successfully. A restore rehearsal and off-server
copy were not performed; do not describe the archive as restore-tested.
Earlier backups were preserved.

## Provisioning completed

The already-deployed migration image was used with the rendered Compose file:

```sh
docker compose \
  -f /data/coolify/applications/yjcpwok2vq6r2yeiposbbip2/docker-compose.yaml \
  run --rm --no-deps --pull never migrate \
  pnpm --filter @theoryfoundry/runtime oauth:provision -- --worker
```

The initial attempt using the older runbook's unsupported `--no-build` flag failed
before provisioning. The supported retry succeeded; a subsequent database read
verified `theoryfoundry-local-worker`, enabled, PKCE required, token auth `none`,
and exact redirect `http://127.0.0.1:43827/oauth/callback`.
No existing accounts, projects, secrets or volumes were replaced.

## Enablement and OAuth repair completed

The owner enabled `THEORYFOUNDRY_LOCAL_WORKER_ENABLED=1` and redeployed through
Coolify. Effective worker and remote MCP flags were both verified as `1` afterward.
The connected Coolify interface still has no deployment/environment update controls.

PR #28 repaired Next.js middleware URL normalization so the exact numeric-loopback
OAuth callback survives unchanged. Coolify deployment `npeeta8kervhgddmozzchz30`
finished at 2026-10-29 22:57:49 UTC. The healthy app image used merged revision
`a2ef333108522b4cf68885c1501bea324fda4f9b`; the migration count remained 13.
The public authorization route accepted the configured callback, preserved state
and rejected an unregistered port. Real native-Keychain login then succeeded.

Continue [release acceptance](worker-release.md) with the named acceptance projects;
see [recorded results](worker-live-acceptance.md). New code merges trigger Coolify
automatically, so recheck the deployed revision after each authorized merge.

## Recovery

For a worker-specific fault, set the worker flag back to `0` and redeploy the same
known-good revision. Keep remote MCP and ordinary browser access unchanged. If the
app revision itself needs rollback, select the recorded previous commit/image in
Coolify and confirm database compatibility before switching. Keep the PostgreSQL
volume and auth secret intact. The provisioned public client can remain unused while
the flag is off; disabling it is a separate deliberate access change.

These changes require no database restore. If corruption ever requires restoring
the recorded backup, stop writers and rehearse restoration into a separate database
first; obtain explicit authorization before replacing production data. Do not run
`down -v`, reset the database, or overwrite the current volume as routine rollback.
