# Maintenance

`local status --json` reports the installation and readiness. `local logs --json`
returns a bounded diagnostic tail. Do not paste raw logs into issues. `local stop`
stops containers while preserving database, exports and the erasure journal.

Run `local start` to repair an unhealthy installation. It verifies Docker ownership
of an occupied port before stopping its own app/gateway and restarting the stack.
`PORT_BUSY` means ownership could not be established; never stop the unrelated
listener or change an existing origin to work around it. Cancelled startup attempts
stop local services with a separate cleanup deadline. If `CLEANUP_PENDING` appears,
run `local stop` before retrying.

The skill launcher forwards interruption/termination and waits for worker cleanup,
including when npm exits first. Cancellation returns exit code 130 or 143. If the
launcher reports that cleanup timed out, run `local stop` before another start.

The default instance is under `~/.theoryfoundry/local`; `THEORYFOUNDRY_LOCAL_HOME`
selects another installation. Its port is fixed after creation. Choose an unused
`--port` on the first `local start`; changing an existing origin requires restoring
to an empty home. Never adopt or overwrite a developer database volume.

Backups are cold physical PostgreSQL 18 snapshots of all three volumes, plus the
installation metadata and secrets, encrypted with a hidden passphrase:

```sh
theoryfoundry-worker local backup --output /absolute/local.tfbackup
```

Run passphrase operations in a real terminal. The agent must not collect or pipe
the password. Save the passphrase independently; the backup cannot be recovered
without it. Snapshot size is capped at 256 MiB compressed. Backup leaves the stack
stopped; resume explicitly with `local start`.

Restore requires an empty target home, the backup's exact images and matching
worker version. It creates new volume names, leaving the source untouched:

```sh
THEORYFOUNDRY_LOCAL_HOME=/absolute/new-home theoryfoundry-worker local restore --input /absolute/local.tfbackup --port 43101
THEORYFOUNDRY_LOCAL_HOME=/absolute/new-home theoryfoundry-worker local start
```

Reconnect to authorize the restored instance. Backups contain sensitive project
and account data even though encrypted; keep files private.

`local upgrade --release /absolute/local-release.json --output /absolute/before.tfbackup`
requires an immutable manifest matching the running worker. It prepares images,
creates an encrypted cold backup, then applies migrations and starts the new app.
A failed upgrade leaves the instance stopped and marked pending. Do not start an
older image against migrated data. Restore the backup into an empty home instead.

Lifecycle operations use an exclusive lock. After a crash, verify all local
lifecycle CLI processes have stopped before removing only `operation.lock` in the
installation home. Worker credential locks have their own recovery procedure;
never remove them while any worker/authentication process is running.
