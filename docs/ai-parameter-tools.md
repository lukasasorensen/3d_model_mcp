# AI parameter tools (THE-54)

`list_model_parameters` discovers revision-owned definitions. `edit_parameters`
creates one immutable candidate from a batch of edits. Both use the existing
[generated document workflow](project-parameters.md); no mutable parameter store or
new migration is introduced. Hosted MCP, local-worker MCP/CLI and sidebar chat
expose the same operations. Interactive controls remain THE-55.

## Read and edit

List with `{ "projectId": "example" }`, optionally adding `revision` for history.
The result contains `revision` and `parameters`, including current/default values,
labels, constraints and control metadata. Empty projects return a null revision and
an empty list. Use `read_model_source` for the separate editable body.

```json
{
  "projectId": "example",
  "parentRevision": "revision-returned-by-read",
  "requestId": "edit-request-1",
  "toolCallId": "edit-tool-1",
  "operations": [{ "op": "set_value", "id": "width-id", "value": 40 }]
}
```

Call `edit_parameters` with this input. It returns `{ "candidate": ... }`, without
body text. Then call `validate_and_render`, inspect the preview and diagnostics,
and `promote_candidate` against the same expected parent. Accepted state does not
change until promotion. Chat supplies the request/tool IDs and binds the project
server-side; external MCP callers supply them explicitly.

Supported batch operations:

| Operation   | Fields        | Behavior                                                         |
| ----------- | ------------- | ---------------------------------------------------------------- |
| `create`    | `parameter`   | Complete definition with a new stable ID                         |
| `update`    | `parameter`   | Complete replacement of an existing definition, retaining its ID |
| `set_value` | `id`, `value` | Change only the current value; preserve the default and metadata |
| `delete`    | `id`          | Remove an existing definition                                    |

A batch contains 1–200 operations, each targeting a different ID. This permits
replacing a full 100-parameter snapshot with new IDs. The final snapshot still has
at most 100 definitions and 128 KiB of JSON. Duplicate targets, existing create
IDs, missing update/delete IDs, unknown fields and invalid values are rejected.
`update` is a full replacement: omitted optional metadata is removed. Changing an
ID uses delete/create; changing a binding uses update with the same ID.

All operations apply before final binding uniqueness and body compatibility checks.
Binding swaps and delete/create reuse therefore work in one batch. An invalid
operation rejects the whole edit. Existing type, value, control, bounds and
OpenSCAD restrictions remain in force; values never contain raw expressions.

## Body, replay and concurrency

Omitting `modelBody` preserves the named parent's generated body byte-for-byte.
Genesis (`parentRevision: null`) and adoption of legacy source-only models require
an explicit body. Adoption never discovers variables, strips declarations or
parses headers. Binding rename/deletion must explicitly update any old references
in `modelBody`; no unmanaged declaration is silently preserved.

Edits always resolve from the immutable named parent, including retry requests
after current advances. Existing candidate identity includes the resulting body,
assembled source, canonical snapshot, parent and request/tool IDs. Semantically
equivalent batches with that same identity reuse the candidate. Changed inputs do
not reuse a different document; fresh stale proposals are rejected. Current
proposal restrictions apply after exact candidate lookup, preserving historical
replay. Historical reads and restore retain their existing behavior.

Owner checks apply before reads and proposals. The repository rechecks current
parent under its existing transaction/lock when creating or promoting a candidate.
A concurrent UI or AI edit cannot silently overwrite the accepted revision.
Rejected/cancelled renders and stale promotion retain the previous source, body,
values and artifacts. Diagnostics identify invalid operation/snapshot paths and
preserve existing binding/body/render errors.

## Delivery and verification

Versions relative to develop: root/hosted/local plugins 0.10.0 → 0.11.0,
contracts/gateway/local-worker 0.4.0 → 0.5.0, MCP 0.3.0 → 0.4.0,
runtime 0.7.0 → 0.8.0 and site 0.8.1 → 0.9.0. Model-project remains 0.7.0.
Apply THE-52's existing migrations 0017 and 0018 before server startup. There are
no new migrations, renderer pins or environment variables. Update clients and
worker to this release together: companion inference accepts ten advertised tools;
the eight-call execution budget and repair limits are unchanged. Publish and verify
worker 0.5.0 before recommending its installation to end users.

Tests exercise real MCP discovery/calls against filesystem and PGlite fixtures,
CRUD and final-snapshot validation, legacy adoption, body preservation, replay,
owner isolation, competing document edits, failure/cancellation, rename/removal,
reload and restore. Chat tests cover the scripted parameter lifecycle, server IDs,
shared repair limits and body redaction. Local-worker tests cover discovery,
hosted forwarding, error preservation and response limits.

`pnpm acceptance:parameters` exercises creation/value changes through the tools
against pinned OpenSCAD, checking exact body preservation and independently parsed
STL/3MF dimensions. Its report is `dist/parameter-acceptance/report.json`.
`pnpm verify` covers the full repository. Local fixtures and pinned-renderer
acceptance do not establish real PostgreSQL, authenticated provider/UI acceptance,
deployment or publication; record those separately in the PR and release changelog.

Local implementation verification passed on November 16, 2026 (UTC): Node
24.21.0 `pnpm verify`, including 64 browser tests and the production build, plus
`pnpm acceptance:parameters`. The latter exercised both tools with OpenSCAD
2026.07.20/BOSL2 v2.0.741 and sandboxed Chromium 149.0.7827.55; parsed STL/3MF
bounds changed from 30 × 10 × 5 to 40 × 10 × 5 without changing the body.
The three existing optional runtime skips remain: p95 performance, real PostgreSQL
concurrency, and standalone PostgreSQL stdio acceptance. Hosted CI and deployment
status are recorded in the PR and changelog.

PR review fixes replace the packed-worker smoke test's stale tool count with the
exact approved tool names. Local-worker acceptance also checks its complete catalog.
Sidebar parameter failures now preserve bounded, allowlisted diagnostics through
the MCP adapter into model feedback. Reasons, stable parameter paths/IDs, binding
names and body coordinates are available for repairs; unknown metadata is removed,
known credentials/source and sensitive paths are redacted, and public error events
remain generic. A real MCP-to-sidebar regression rejects a below-minimum edit,
delivers its diagnostic, and then validates/promotes the model's corrected edit.
Versions remain the once-per-PR values above.

Review-fix verification passed on Node 24.21.0: full `pnpm verify`, `pnpm pack:worker`,
the packaged-worker `--smoke` acceptance, and `pnpm acceptance:local-worker`.
Local-worker acceptance used real sandboxed Chromium with the pinned renderer and
checked decoded previews, STL/3MF geometry, BOSL2, rejection, cancellation and cleanup.
Its hosted responses are fixtures; authenticated live acceptance remains separate.
