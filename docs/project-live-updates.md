# Project live updates

Project viewers subscribe to `GET /v1/projects/:projectId/events` using authenticated SSE. This runs even with MCP rendering disabled, during chat and exports, and while a tab is hidden. Visible, available tabs alone claim MCP render jobs.

## Commit to viewer

1. Migration-managed triggers on `projects.current_revision_id` and `browser_render_jobs` call `pg_notify('rjls_changes', ...)`. Payloads contain only owner, project, and optional job identifiers.
2. PostgreSQL delivers notifications after commit. Each application process uses a dedicated listener connection, separate from its query pool.
3. The SSE route checks the cookie session and project ownership before delivery and on heartbeats. It sends `ready`, `project-updated`, or `render-jobs-available` invalidations, never source or completion credentials.
4. Viewers read authoritative current revision and immutable history through the existing project GET. The repository holds the project lock while reading both, so promotion cannot split the snapshot. Concurrent refresh requests coalesce and trigger a trailing read.
5. Viewers following current advance automatically. Historical inspection keeps its selection. Preview rendering retains the previous valid geometry until replacement is ready.

SSE heartbeats run every 15 seconds. Clients reconnect after 45 seconds without traffic, using bounded exponential backoff with jitter. A database listener gap closes affected streams; reconnecting viewers subscribe before refreshing and checking pending jobs. Slow consumers are disconnected instead of accumulating an unbounded event buffer. There is no durable event replay: snapshots recover missed changes.

## Rendering

Local MCP, remote MCP, and chat completions use `browser_render_jobs`. The `local-mcp` delivery mode replaces filesystem coordination while retaining local endpoint shapes and feature gates. Tokens are minted only for the successful atomic claim and only their hashes are stored. Local jobs retain their 60-second overall deadline; remote jobs retain their existing 15-second claim and 90-second overall deadlines.

Browser claims run on stream readiness, render notifications, tab visibility, renderer availability, and release. Background work retains foreground-action priority. Completion waiters subscribe before reading persisted state, preserve notifications arriving during reads, and use one-shot deadline timers rather than periodic outcome queries. Reconnection rechecks waiting jobs.

## Deploy and operate

- Apply migration `0004_milky_slapstick` before updating the application. Readiness requires the notification function. Existing SQL names and HTTP command endpoints remain unchanged.
- Finish in-flight local MCP jobs, then restart both the app and stdio MCP processes. Existing filesystem jobs are not migrated. `RJLS_LOCAL_BRIDGE_ROOT` is retired; both processes must use the same database and actor ownership.
- Each process reserves up to one additional PostgreSQL connection for notifications. Keep it outside long transactions. Reconnect failures are logged without payloads or credentials.
- Monitor `pg_notification_queue_usage()`. A full notification queue or trigger error can fail the writing transaction; notifications are part of that transaction.
- Verify streaming through the production tunnel using two signed-in tabs: promote and restore in one, observe history/current updates in the other, then repeat after disconnecting/reconnecting a tab. Check that idle tabs do not issue project GET or render-claim polling.
- Code rollback can retain the additive migration. Do not drop enum values or remove triggers while updated processes still use them.

Tests cover transaction rollback, local/remote claims and token binding, notification-driven waits, deadline and abort wakeups, SSE isolation and revocation, and historical-selection behavior. Live tunnel delivery is an environment acceptance check and is not established by the unit suite.

## PNG preview delivery

Migrations `0005_watery_kulan_gath` and `0006_preview-notifications` add
`browser_preview_jobs`, `browser_presence`, and the `preview_job_changed` trigger.
Readiness requires the enabled preview trigger. Apply both before restarting app
and stdio processes; rollback can retain these additive migrations.

The preview service pins an authorized revision or validated candidate before
checking browser availability. Jobs are distinct from validation receipts. Local
and remote MCP use the same preview endpoints, respecting their existing gates:

- `POST /v1/projects/:projectId/preview-presence`
- `POST /v1/projects/:projectId/preview-jobs/claim`
- `POST /v1/projects/:projectId/preview-jobs/complete`

Preview triggers publish only owner/project/job identifiers with `kind: preview`
on `rjls_changes`. SSE maps these to `preview-jobs-available` invalidations.
Browsers check pending jobs on stream readiness, invalidations, visibility,
availability, and lease release, giving existing validation and foreground work
priority. MCP waiters subscribe before reading and recover missed notifications
through persisted outcomes. There is no job polling or durable event replay.

The SSE parser exposes fifteen-second heartbeat comments separately from job
invalidations. Browser acknowledgements refresh owner/project/tab-scoped presence,
including visibility, readiness, busy state, and supported delivery modes. Presence
uses a fresh in-memory tab ID, independently of the sessionStorage session ID, so
cloned tabs cannot overwrite each other. Migration `0007_noisy_wiccan` backfills
existing rows with distinct IDs and changes the presence primary key; apply it
before restarting and reload existing browser tabs. Presence
expires after forty-five seconds; this is an availability estimate, not proof of a
closed tab. A heartbeat alone does not issue project reads or job claims.

Claims are exclusive and tokens are minted only after a successful claim; the
database stores hashes. Completion verifies owner, project, tab, token, target,
source hash, camera, dimensions, deadline, and pinned provenance. Browser receipts
remain an owner-controlled rendering trust boundary, not server attestation of
what the pixels depict. PNG validation enforces canonical base64, CRCs, format,
dimensions, bounded decompression, and pixel filter framing.

One pending preview per owner/project is allowed. Claiming has fifteen seconds,
the worker retains sixty seconds, and the preview request has an eighty-second
overall deadline. PNGs are limited to 2 MiB; encoded HTTP/MCP payloads to 3 MiB.
Images travel via authenticated HTTP uploads and native MCP image blocks, never
SSE/NOTIFY. Temporary completions are deleted after delivery/failure/cancellation;
expired jobs are swept on startup and preview/presence activity. An idle stopped
application may retain expired rows until the next sweep. No permanent PNG cache
is created. Log records contain only duration, outcome, and byte count.

Production acceptance: verify the existing tunnel streams `ready` and preview
invalidations without buffering; request a preview with the page absent, follow
the returned URL, sign in and retry; inspect all camera presets before promotion;
repeat after an SSE disconnect. Confirm idle tabs send only presence acknowledgements
and that SQL job reads occur on notifications/deadlines rather than timers.

During rendering, SSE invalidations and reconnect readiness trigger coalesced
`POST /v1/projects/:projectId/preview-jobs/status` checks for the active job.
Checks require the owner, project, session and claim token. A removed or expired
job aborts the browser worker and releases the render lease. The browser also
checks immediately after claiming to cover cancellation before its monitor starts.
Monitoring stops when rendering finishes, before upload, so normal completion
cleanup cannot abort successful delivery. These checks do not use a polling timer.
