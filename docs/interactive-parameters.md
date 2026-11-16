# Interactive parameter controls (THE-55)

The workspace Parameters panel edits registered scalar values without an AI
connection. It is in the Model section on mobile and uses native controls with the
existing theme. Definitions and defaults remain owned by the immutable parameter
snapshot. AI tools manage definitions and coordinated body edits; the panel changes
values only. Source display remains read-only.

## Editing and acceptance

- Numbers and integers use exact decimal/exponent text entry. Slider hints add a
  synchronized native range input; bounds and step come from the shared contract.
  Incomplete input is a draft, never zero. No clamping or automatic rounding occurs.
- Booleans use checkboxes; strings use multiline text controls; enums use selects
  that preserve numeric/string option types. Metadata is displayed as plain text.
- Apply batches changed values into one candidate against the draft's exact parent.
  The server inherits that parent's model body byte-for-byte, generates the header,
  validates/renders and promotes only a valid candidate. Dragging does not save or
  render. Unchanged or invalid drafts cannot be applied.
- Reset to defaults stages stored defaults. Apply is still required. Individually
  valid defaults can violate assertions in the body; failed validation leaves the
  accepted revision untouched. Discard restores accepted values.
- Accepted values are shown beside draft fields. The prior saved model remains
  visible while work is pending or fails. Downloads use the accepted revision.
  Historical revisions show read-only values and retain the existing restore flow.
- Models without definitions show an empty state. Source-only and historical legacy
  documents require explicit adoption; no declarations are discovered or stripped.

Labels, help, units, bounds and field errors are associated with controls. A slider
always has exact input as an alternative. Apply failures focus an error summary;
progress and saved outcomes are announced without live announcements on every drag.

## HTTP and orchestration

`GET /v1/projects/:projectId/parameters?revision=...` returns a bounded snapshot:
`revision`, `sourceHash`, `editable` and `parameters`. Without a revision it resolves
current state once and reads that immutable revision. Empty projects return null
revision/hash and an empty snapshot. Body/source text is omitted.

`POST /v1/projects/:projectId/parameters` requires same-origin authenticated access,
the matching `x-theoryfoundry-session-id` header, and this strict JSON shape:

```json
{
  "parentRevision": "accepted-revision",
  "sessionId": "browser-session",
  "requestId": "opaque-attempt-id",
  "operations": [{ "op": "set_value", "id": "width", "value": 30 }]
}
```

The batch contains 1–100 distinct targets. Body edits, definition mutations and
unknown fields are rejected. The request has a 256 KiB byte limit. Shared parameter
and generated-source limits remain authoritative.

The site controller calls one Apply workflow through the owner-scoped MCP client:
`edit_parameters` → `validate_and_render` → `promote_candidate`. It does not call an
AI provider or depend on chat feature flags. Existing renderer coordination,
completion authentication, provenance checks, leases and parent checks are reused.

The response is newline-delimited JSON: progress, optional browser render handoff,
and exactly one terminal saved/error event. Every event binds request/session IDs
and a monotonic sequence. The browser rejects malformed, oversized, reordered,
cross-session and truncated streams. Render source appears only in the bounded
render handoff; parameter read and saved responses omit it.

The operation has a 180-second overall bound. Abort propagates into the MCP call,
browser worker and completion request. Renderer subscriptions and foreground leases
are released on completion/failure. Cancellation can race a committed promotion;
the client refreshes authoritative project state instead of assuming rollback.

## Retry and conflict behavior

Identical interrupted submissions keep their original parent and request/tool ID.
The proposal returns its original candidate. If already promoted, Apply returns
the corresponding historical revision without validating or promoting again. A
replay does not move the accepted pointer backward. Changed payloads receive a new
request identity. Rejected candidates remain rejected on exact replay.

The panel coordinates foreground work with chat, restore, exports and background
rendering. Cross-tab and AI writes still rely on server-side parent checks.

Incoming revisions never overwrite dirty drafts. A stale draft is disabled until
the user discards it or chooses to review it against the latest snapshot. Only
edited values with unchanged definitions are carried forward. Changed/removed
definitions are listed for explicit review, and their old values are not copied.
Late reads and completions are ignored after cancellation or unmount. Saved values
are not presented beside an older workspace revision when refresh fails.

## Verification and release

Focused tests exercise all scalar types, defaults, parsing, typed enums, bounds,
step alignment, explicit conflict review and route authorization/budgets. Actual
MCP calls against filesystem and PGlite fixtures cover Apply, rejection, cancellation,
immutable replay after current advances, competing AI promotion, reload/restore and
owner isolation. A real browser-render coordinator test checks session-bound
completion, abort before promotion and successful subsequent rendering.

Browser journeys exercise native keyboard behavior, narrow-screen reflow, pending
and error states, Reset/Discard, interrupted retries, historical viewing and stale
definition review. The full browser matrix includes forced colors and reduced
motion. These are automated browser fixtures, not manual screen-reader/device proof.

`pnpm acceptance:parameters` also clicks the actual panel through HTTP Apply with
fixture authentication and the pinned real renderer. STL and 3MF bounds change to
45 × 10 × 5 with the body unchanged. Invalid default combinations retain accepted
geometry; correcting the draft succeeds. Reports and a control screenshot are
written to `dist/parameter-acceptance/`. Run with pinned Node 24 and Playwright
Chromium installed. This does not establish live PostgreSQL or authenticated hosted
acceptance.

Versions relative to develop: root/hosted/local plugins 0.11.0 → 0.12.0, site
0.9.0 → 0.10.0, contracts 0.5.0 → 0.6.0. Existing MCP/worker protocols are unchanged;
worker remains 0.5.0 and its pins remain current. No new migration, environment
variable, renderer pin or generated-header version is introduced. Existing 0017/0018
migrations remain prerequisites. CI, deployment/publication and manual/live
acceptance evidence are recorded separately in the PR and release changelog.

Local verification passed on Node 24.21.0: full `pnpm verify` (74 browser checks and
production build), `pnpm acceptance:parameters`, hosted/local plugin packaging,
worker packaging and the external packaged-worker `--smoke` harness. The pinned
renderer was OpenSCAD 2026.07.20/BOSL2 v2.0.741 with sandboxed Chromium 149.0.7827.55.
Three existing optional runtime tests remain skipped (p95, real PostgreSQL
concurrency and standalone PostgreSQL stdio). Authenticated hosted acceptance,
manual screen-reader/native-device checks, deployment and publication are pending.
