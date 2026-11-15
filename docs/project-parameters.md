# Generated parameter documents (THE-52)

Parameter JSON owns declarations. Each immutable candidate/revision stores the
editable model body separately from the complete generated OpenSCAD source and its
parameter snapshot. The header is generated during proposal creation, before
validation, rather than patched with regex or injected at render time. Renderers,
previews and exports use that exact stored source and its existing source hash.

## Proposal contract

Supply exactly one of `modelBody` or legacy `source`:

```json
{
  "projectId": "example",
  "parentRevision": null,
  "modelBody": "cube([width, 10, 5]);",
  "parameters": [
    {
      "id": "width-id",
      "binding": "width",
      "label": "Width",
      "type": "number",
      "defaultValue": 10,
      "value": 30
    }
  ],
  "requestId": "request-1",
  "toolCallId": "tool-1"
}
```

This generates and persists:

```scad
// theoryfoundry:parameters:start v1
width = 30;
// theoryfoundry:parameters:end
cube([width, 10, 5]);
```

A value-only proposal changes JSON and regenerates the whole header. It preserves
the body byte-for-byte. Defaults remain separate from accepted values. Definitions
are canonicalized by stable ID; enum option order is significant. Labels and other
metadata are not interpolated into source. Binding identifiers and scalar values
are validated before an OpenSCAD-specific encoder writes declarations. Strings
escape quotes, backslashes, newline, carriage return and tab; unsupported control
characters and unpaired surrogates are rejected. Raw expressions/code are not values.

Supported types are finite numbers, safe integers, booleans, strings and homogeneous
string/number enums. Both current/default values satisfy bounds, step, membership
and length constraints. Sliders require increasing finite bounds and a positive
explicit step. Snapshots allow at most 100 unique IDs/bindings and 128 KiB of JSON.
OpenSCAD keyword bindings, unknown fields and coercion are rejected.

The generated header plus body must satisfy the existing source byte/reference
policy. Generating a header cannot bypass the complete-source size limit.

## Body ownership and conflicts

The generated header is read-only. `modelBody` contains modeling code, derived
expressions and permitted includes, without managed header declarations. The server
does not parse the generated header or search/replace literals. Stored generated
documents are checked by deterministic reassembly from body and JSON.

A separate conservative token scan still checks the body for conflicting assignments
to registered names, ignoring comments and strings. It also rejects managed header
markers in parameterized bodies. Same-name local assignments, module defaults and
named arguments are currently rejected. This scan is not scope analysis, does not
resolve included libraries and cannot prove that a variable affects geometry.
THE-53 owns broader diagnostics, explicit legacy adoption and refinement of this
conflict policy. The exact assembled source still needs pinned-renderer validation
before promotion. A successful render is not proof of geometric influence.

Removing or renaming a definition removes or renames its generated declaration.
Coordinate body edits explicitly when references need changing; the server does
not silently preserve an untracked literal or rewrite references. Failed renders
and stale parents retain the previous accepted source, body and values.

## Inheritance, retry and restore

Omitting `parameters` inherits the explicitly named parent's snapshot, including
when replaying a proposal after current has advanced. Supplying `[]` removes all
generated declarations; assembled source then equals the exact body. Parameterized
proposals require `modelBody`; legacy `source` is accepted only with an empty
resolved snapshot. Both fields together, or neither, are rejected.

Retry identity includes named parent, exact assembled source, separate body/mode,
canonical parameter snapshot and request/tool IDs. Equal rendered source with
different metadata or legacy/generated modes cannot reuse the wrong candidate.
Identical retries return the original candidate and current state.

Promotion advances source, body, parameters and artifact references together using
PostgreSQL transactions/locks or a durable filesystem revision and atomic `CURRENT`
pointer. Restore copies the historical body, source and snapshot into a new child
revision. It does not regenerate historical source using a newer generation policy.
PostgreSQL operations remain owner-scoped; filesystem storage is a trusted local
workspace boundary. No new mutable project-level parameter authority is introduced.

## Reads and compatibility

MCP `read_model_source` returns `modelBody` and the full snapshot for generated
documents, or `source` for legacy documents. It avoids duplicating the assembled
source alongside a large body. `sourceHash` always identifies the complete stored
render source, not the body alone. Internal repository reads retain complete source
for preview/export, alongside the body for editable generated documents.

Candidate/revision manifests include the separate body for generated records.
MCP `list_revisions` omits bodies and snapshots, returning compact revision metadata.
Current project state exposes accepted parameters without repeating body text.
Local-worker JSON results retain the server's 512 KiB logical-payload budget and a
separate MCP envelope bound of three payloads plus 1 KiB. Preview images retain the
existing 3 MiB envelope limit.

Existing source-only records have no body and an empty snapshot; their wire shape
and source stay unchanged. Existing prerelease records from the earlier editable
header design remain historical source/snapshot records without automatic splitting
or header parsing; adoption into generated documents is explicit. New generated
records verify that reassembly agrees exactly with persisted source. Older strict
clients must upgrade before using generated/parameterized documents.

## Migration and delivery

Apply both additive migrations before starting updated server code:

- `0017_parameter-snapshots`: non-null JSONB `parameter_snapshot` on candidates and
  revisions, defaulting to an empty array.
- `0018_generated-parameter-headers`: nullable `model_body` text on both tables.
  Existing source, snapshots, hashes and accepted pointers are untouched.

Filesystem manifests carry optional `modelBody` alongside `parameters`; complete
source remains in `model.scad`. There are no new tables, environment variables,
renderer assets or runtime render overrides. Contract version remains 1.

Versions relative to develop after THE-50: root/hosted/local plugins 0.8.0 → 0.9.0,
contracts 0.3.0 → 0.4.0, model-project 0.5.0 → 0.6.0, MCP 0.2.0 → 0.3.0,
gateway/local-worker 0.3.0 → 0.4.0 and site 0.8.0 → 0.8.1. These are once-per-PR changes;
worker pins/setup/release examples are synchronized. Publish and verify worker
0.4.0 before end users install it. Installer pins and renderer assets are unchanged.

THE-54/55 add dedicated AI management tools and controls using body plus JSON.
They must not introduce independently editable generated declarations.

## Verification

Focused tests cover deterministic scalar encoding, injection/escaping, unchanged
body text, inheritance/removal, mode-aware retries, assembled source policies,
legacy migration, owner isolation, reopen/restore, corruption detection and atomic
publication failures in both adapters. MCP checks cover bounded generated-body
reads, historical snapshots and compact history. PGlite and deterministic renderer
fixtures do not establish live PostgreSQL or authenticated UI acceptance. Full
verification and hosted CI evidence are recorded separately in the PR.

A local pinned-renderer check on November 15, 2026 compiled generated numeric,
boolean, string and numeric-enum declarations with the body unchanged. OpenSCAD
assertions verified quote, backslash, newline, carriage-return and tab encoding;
Unicode and source-like string content compiled safely. JSON widths 30 and 40
produced independently parsed STL and 3MF bounds of 30 × 10 × 5 and 40 × 10 × 5.
The renderer reported the pinned OpenSCAD 2026.07.20/BOSL2 v2.0.741 provenance,
Chromium 149.0.7827.55 with sandbox enabled and no blocked external requests. This
is local renderer evidence, not live database, deployment or authenticated UI
acceptance. Reproduction/report: `/private/tmp/generated-header-acceptance.mjs`
and `/private/tmp/generated-header-acceptance.json`; the findings above do not
require those temporary artifacts to remain available.
