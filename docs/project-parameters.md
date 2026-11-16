# Generated parameter documents (THE-52 / THE-53)

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
expressions and permitted library imports, without managed header declarations. The server
does not parse the generated header or search/replace literals. Stored generated
documents are checked by deterministic reassembly from body and JSON.

THE-53 applies a conservative lexical policy to every new proposal, including
inherited snapshots. It does not resolve scopes or discover arbitrary model variables:

- Reject assignments to managed names anywhere, including local scopes, `let`,
  loops, comprehensions, defaults and named call arguments. Use distinct local
  names or positional call arguments. Equality comparisons remain allowed.
- Reject managed names in module/function formal arguments, including arguments
  without defaults and anonymous functions. Other locals and derived expressions
  remain allowed.
- Reject `include` while parameters exist because included declarations can
  overwrite generated values. Use a permitted `use <BOSL2/...>` import when only
  module/function definitions are needed, or supply a self-contained body.
  Libraries that require `include` initialization are not supported in managed
  documents under this policy. Legacy source-only models remain usable.
- Reject managed header markers even with an empty snapshot or legacy `source`
  input. Adoption is explicit: supply `modelBody` without the header or conflicting
  declarations and parameter JSON; nothing is automatically stripped or registered.
- Removing or renaming a binding rejects any remaining identifier with that old
  name in the body, even local arguments or explicit unmanaged assignments. Update
  those names/references explicitly in the same proposal. Strings, comments and
  import paths do not count. No literals or references are silently preserved or
  rewritten. Renaming an ID while retaining its binding does not remove a binding.

`INVALID_PARAMETERS` includes a concise input JSON path for schema failures.
Renderer-incompatible numeric values identify `parameterId`, `binding` and `field`
(`value`, `defaultValue` or `options.N.value`), independent of canonical ID ordering.
Body conflicts include a diagnostic code, binding when applicable, and one-based
body line/column (UTF-16 code units; LF advances lines). Lexical errors identify
unterminated strings/comments. OpenSCAD compile/assertion diagnostics refer to the
exact assembled source: with N definitions, body line 1 is assembled line N + 3.
The generation policy does not claim that a successfully rendered parameter
influences geometry, nor that library internals have been analyzed.

The pinned renderer validates the exact assembled source before promotion. Failed,
rejected or cancelled renders and stale parents retain the previous accepted source,
body and values together. Historical restore copies stored source rather than
applying newer proposal restrictions to old revisions.

## Inheritance, retry and restore

Omitting `parameters` inherits the explicitly named parent's snapshot, including
when replaying a proposal after current has advanced. Supplying `[]` removes all
generated declarations; assembled source then equals the exact body. Parameterized
proposals require `modelBody`; legacy `source` is accepted only with an empty
resolved snapshot. Both fields together, or neither, are rejected.

Retry identity includes named parent, exact assembled source, separate body/mode,
canonical parameter snapshot and request/tool IDs. Equal rendered source with
different metadata or legacy/generated modes cannot reuse the wrong candidate.
Identical retries return the original candidate and current state. Both adapters
resolve the immutable identity and look up an exact persisted match before applying
the current proposal policy. This preserves retries across policy upgrades, even
after current advances. Changed body, metadata, mode, parent or request/tool IDs
cannot reuse a historical candidate to bypass new-proposal validation. Ownership
checks and project locking/transactions still precede lookup.

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
MCP proposal, validation, promotion and restore replies omit body text while keeping
IDs, state, source hashes, accepted parameters and other bounded metadata. The local
worker applies the same projection to its locally computed validation reply before
MCP serialization. This prevents large stored bodies from causing an error response
after an operation has committed; persisted bodies and snapshots are unchanged.
MCP `list_revisions` omits bodies and snapshots, returning compact revision metadata.
Current project state exposes accepted parameters without repeating body text.
Live chat validates the same source-read contract, accepts both body/JSON and legacy
source documents, and checks the selected revision against current state before
sending context to the provider. Generated bodies retain the existing assistant-text
redaction policy. Context instructs JSON-only value edits to preserve the body.
Local-worker JSON results retain the server's 512 KiB logical-payload budget and a
separate MCP envelope bound of three payloads plus 1 KiB. Preview images retain the
existing 3 MiB envelope limit.

Existing source-only records have no body and an empty snapshot; their wire shape
and source stay unchanged. Existing prerelease records from the earlier editable
header design remain historical source/snapshot records without automatic splitting
or header parsing; adoption into generated documents is explicit. New generated
records verify that reassembly agrees exactly with persisted source. Older strict
clients must upgrade before using generated/parameterized documents.

## Generation version 1

The persisted header marker is `// theoryfoundry:parameters:start v1`. Definitions
are sorted by stable ID using code-unit order. Each binding uses ASCII
`[A-Za-z_][A-Za-z0-9_]{0,99}`, excluding OpenSCAD keywords; special `$` variables
cannot be managed. Declarations use one space on either side of `=`, a semicolon
and LF separators. The end marker and one LF precede the unchanged body. Empty
snapshots produce the body alone. Labels/defaults do not enter source.

Numbers use JavaScript's deterministic finite-number string representation,
including signed decimals and exponents; negative zero canonicalizes to `0`.
New proposals reject nonzero magnitudes below `2.2250738585072014e-308` in
current/default values and numeric enum options: the pinned OpenSCAD lexer rejects
subnormal literals. Historical snapshots retain their original bytes and readability.
Booleans use `true`/`false`. String literals escape quotes, backslashes, newline,
carriage return and tab; Unicode scalar values are retained without normalization.
Other C0 controls and lone surrogates are rejected. The schema and exact generated
source both remain subject to their existing bounds and source policy.

Version 1 byte generation is frozen: changes to emitted bytes require an explicit
version/migration design that preserves historical reads, hashes and restore. The
THE-53 proposal checks do not change generation bytes or the render policy version.
OpenSCAD's [lexer](https://github.com/openscad/openscad/blob/master/src/core/lexer.l)
is supporting syntax reference; acceptance against the pinned renderer is the
compatibility check, independent of changes on upstream master.

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

THE-54 adds [AI parameter tools](ai-parameter-tools.md) using body plus JSON.
THE-55 adds interactive controls. Neither introduces independently editable
generated declarations.

## Verification

Focused tests cover deterministic scalar encoding, injection/escaping, unchanged
body text, inheritance/removal, mode-aware retries, assembled source policies,
legacy migration, owner isolation, reopen/restore, corruption detection and atomic
publication failures in both adapters. MCP checks cover bounded generated-body
reads, historical snapshots and compact history. Regression cases also drive a
connected-model value change from generated context through promotion, reject
malformed/stale context, and complete large-body proposal, validation, promotion and
restore with compact replies. The local-worker regression exercises the actual
in-memory MCP client/server and checks both text and structured metadata. PGlite and deterministic renderer
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

## THE-53 delivery and repeatable acceptance

Versions relative to develop: root/hosted/local plugins 0.9.0 → 0.10.0 and
model-project 0.6.0 → 0.7.0. No new migration, renderer pin, environment variable,
or worker version is needed; THE-52's migrations remain prerequisites.

Run `pnpm acceptance:parameters` with the pinned Node version and installed
Playwright Chromium. The checked-in harness exercises the real filesystem
proposal/validation/promotion path with pinned OpenSCAD WASM and independently
parses STL/3MF geometry. It checks scalar encoding (including Unicode and finite
numeric extremes), unchanged bodies, assertion/syntax diagnostics, cancellation,
stale promotion and unused parameters. It writes provenance and observations to
`dist/parameter-acceptance/report.json` and cleans up its disposable workspace.
This command is separate from `pnpm verify`; it needs a sandboxed Chromium process
and a loopback server. Ordinary regressions cover both filesystem and PGlite
adapters, including explicit legacy adoption, removal/rename and atomic failures.

Local THE-53 acceptance passed on November 15, 2026 with OpenSCAD 2026.07.20,
BOSL2 v2.0.741 and Chromium 149.0.7827.55 (sandbox enabled, zero external requests).
Widths 30 and 40 produced independently parsed 30 × 10 × 5 and 40 × 10 × 5
STL/3MF bounds. Unicode/escape assertions, normal numeric extremes, allowed `use`,
removal/rename, assertion/syntax rejection, in-flight cancellation, stale promotion
and unused-parameter rendering all passed. Subnormal values reproduced the pinned
lexer failure and are now rejected before persistence. These are local renderer and
fixture results; real PostgreSQL, deployment and authenticated live acceptance
remain separate. Full verification and hosted CI are recorded in the PR.

PR #66 review fixes preserve exact retries of v1 candidates created before the
THE-53 restrictions. Filesystem and PGlite regressions seed historical include,
shadowing, subnormal, removed-binding and embedded-header records, replay their
current states after current advances, reject changed proposals and verify owner
isolation. Numeric diagnostics now use stable IDs/bindings plus field paths; tests
cover reordered input, current/default values and enum options. The once-per-PR
versions above are unchanged.
