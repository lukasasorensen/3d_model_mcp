# Model preview verification

## Automated checks

`pnpm verify` passed, including lint, type checks, package boundaries, the
full test suite, and the optimized production build. The two existing optional
runtime tests remained skipped. Migration generation reports no schema drift.
Local development migrations were applied successfully.

The new runtime integration suite uses a real PostgreSQL engine through PGlite,
applying the committed migration journal including preview tables and triggers.
It exercises candidate validation requirements, current revision resolution,
local/remote job delivery, presence states and expiry, ownership isolation,
exclusive claims, token hashes, completion binding/replay, cancellation, deadlines,
cleanup, identifier-only notifications, and transaction rollback.

PNG tests cover canonical base64, CRC corruption, wrong dimensions, size limits,
and truncated files. Protocol tests use the official MCP SDK over actual stdio
and HTTP request/response transport; they verify one native PNG image block,
structured metadata without duplicate image bytes, strict inputs, and guided
browser errors. SSE tests verify heartbeat acknowledgements do not become job
invalidations and preview events remain owner-scoped and credential-free.

## Real browser acceptance

A signed-in local browser used an isolated project and the pinned OpenSCAD worker
to validate an asymmetric bracket. The manual acceptance runner called the actual
stdio MCP process, received all seven native PNG responses, and left the candidate
unpromoted. After leaving the project page and allowing presence to expire, the
MCP tool returned `BROWSER_REQUIRED` with the correct project URL. Reopening that
URL and retrying returned an identical isometric image hash. Each 768×768 image was visually inspected: nonblank, correctly oriented,
fully framed, and free of UI overlays. The interactive viewer remained unchanged.

Observed PNG sizes were 14,766–27,230 bytes. After the initial 1.36-second request
(including development route compilation), subsequent preview requests took
132–173 ms on this development machine. These are local observations, not Proxmox
performance measurements. Images are saved under `/tmp/rjls-preview-evidence`.

To repeat against a disposable development project, sign in and open it visibly:

```sh
RJLS_PREVIEW_TEST_PROJECT=PROJECT_ID pnpm exec dotenv --no-expand -e apps/site/.env.local -- node packages/runtime/src/fixtures/browser-preview-smoke.mjs
```

The runner creates and validates a candidate, requests all seven views, and never
promotes it. Set `RJLS_PREVIEW_TEST_CANDIDATE` to an existing VALID candidate to
request one image without creating another candidate; this also prints structured
browser-required errors for absence/recovery testing.

## Deployment acceptance

Production tunnel testing is still required after deployment: confirm SSE is not
buffered, retry after opening the returned URL, and recover after a stream gap.
The local checks do not establish production OAuth/tunnel delivery or guarantee
that every MCP host supports automatic browser opening.

## Review regression coverage

Additional tests reproduce a hidden cloned tab sharing the visible tab's session
ID and confirm it cannot override presence. Active-preview tests cover cancellation
releasing a queued foreground action, invalidations arriving during status reads,
late responses during successful delivery, lifecycle cancellation, and status-read
failure. Worker tests verify both pre-aborted and in-flight cancellation terminate
without leaving OpenSCAD work running. Status authorization tests reject mismatched
owners, sessions and claim tokens.
