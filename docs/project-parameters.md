# Project parameter snapshots (THE-52)

Parameters belong to immutable candidates and accepted revisions. PostgreSQL stores
`parameter_snapshot` JSONB on each row; filesystem storage puts the same optional
`parameters` field in candidate/revision manifests. Promotion advances source and
parameters through the existing transaction or durable CURRENT pointer. Restore
copies the historical snapshot into a new child revision.

## Contract

`propose_model_source` accepts an optional `parameters` array. Each entry has a
stable project-scoped `id`, an OpenSCAD `binding`, `label`, optional `description`,
`type`, `defaultValue` and current `value`. The supported discriminants are:

- `number` / `integer`: optional `min`, `max`, positive `step`, `unit` and `control`
  (`input` or `slider`). Integer values/bounds/steps must be safe integers.
- `boolean`: optional `control: "checkbox"`.
- `string`: optional `maxLength` and `control: "input"`.
- `enum`: homogeneous string or finite-number `options` with separate labels;
  optional `control: "select"`.

Both default and current values must satisfy constraints. Steps are based at
`min`, or zero when no minimum is specified; quotient error tolerance is 1e-8.
Sliders require increasing finite bounds and an explicit step. Snapshots contain
at most 100 definitions with unique IDs and bindings. Metadata is bounded and
unknown properties/types are rejected without coercion.

The current value must match its source header literal. The default is separate
and is not changed when accepting a new value. Snapshot identity is canonicalized
by ID and parsed property order; enum option order remains meaningful.

## Dedicated header

Registered parameters require this header before model code:

```scad
// theoryfoundry:parameters:start v1
width = 20;
// theoryfoundry:parameters:end
cube([width, 10, 5]);
```

Only comments, whitespace and scalar literal assignments are allowed inside it.
Markers must match exactly, including version, on their own comment lines.
Strings support escaped quote/backslash and `\n`, `\r`, `\t`; Unicode text may
appear directly. Raw multiline strings in the model body remain valid, while header
strings use escapes for line breaks. Signed finite decimal/exponent numbers and
booleans are supported.
Repeated/missing markers, duplicate declarations, unsupported content, mismatched
values and conflicting assignments outside the header are rejected.

The storage guard lexes comments and strings rather than searching source text.
Its conflict check is deliberately conservative: same-name local assignments and
named arguments are rejected for registered bindings. It does not interpret
OpenSCAD data flow, library scope or whether a variable influences geometry. The
exact source still passes through the existing pinned-renderer validation before
promotion. THE-53 owns safe RHS editing, richer source diagnostics and broader
binding/conflict handling; THE-54/55 own dedicated AI tools and user controls.

## Omission, removal and compatibility

Omitting `parameters` inherits the explicitly named parent's snapshot, including
when replaying a proposal after current has advanced. It never silently drops
registrations. An incompatible source edit must supply an updated matching
snapshot or explicitly remove registrations with `parameters: []`. Removing a
registration does not edit its source literal.

Old records and projects have an empty snapshot and require no header or automatic
source migration. Empty snapshots are omitted from outputs to preserve existing
wire shapes. Parameterized candidates, revisions and project state expose
`parameters`; older strict clients must be upgraded before using such projects.
MCP `list_revisions` returns revision summaries without repeating parameter
snapshots. `read_model_source` returns the selected current/historical revision
with its full snapshot; internal repository history retains all snapshots. This
keeps ordinary history reads below the response limit as parameterized revisions
accumulate. Parameter validation error details are bounded to the public contract.

Local-worker JSON tools apply the 512 KiB limit to the logical payload, matching
the hosted server. The MCP envelope has a separate bound of three payloads plus
1 KiB for framing: structured data and its escaped text copy both fit without
dropping source or metadata. Text-only results use the same logical limit; error
responses keep their existing limit. Preview images retain their separate 3 MiB
full-envelope limit.

The contract version remains 1, and renderer requests/pins and source/artifact
hashes remain unchanged. Values are baked into canonical source, not supplied as
runtime render overrides.

Proposal retries compare parent, exact source, request/tool IDs and canonical
parameter snapshot. Equal source with different metadata produces a distinct
candidate, preserving the existing behavior for different source payloads under
the same request IDs. Identical retries return the original candidate/state.
PostgreSQL reads and writes continue through owner-scoped project access. The
filesystem adapter remains a trusted local-workspace boundary.

## Migration and delivery

Apply additive migration `0017_parameter-snapshots` before starting updated server
code. It adds non-null JSONB columns with an empty-array default; it does not
modify existing source, ownership, leases, artifacts or accepted revision pointers.
No new environment variables or renderer assets are required.

Relative to develop after THE-50, root/hosted/local-plugin versions advance
0.8.0 → 0.9.0, contracts 0.3.0 → 0.4.0, model-project 0.5.0 → 0.6.0 and MCP
0.2.0 → 0.3.0. Local-worker advances 0.3.0 → 0.3.1 for the response-budget fix;
the site advances 0.8.0 → 0.8.1 for updated setup commands. Worker command pins
advance to the fixed version; publish and verify it before users install it.
Installer command pins and renderer assets are unaffected.

## Verification

Focused tests cover schema constraints, header literal agreement, metadata-aware
retry identity, inherited/removed snapshots, reload and historical restore for
both adapters, cross-owner access, additive legacy migration, transactional and
filesystem publication failures, and JSON Schema generation for MCP input.
PGlite and deterministic renderer fixtures prove storage/protocol behavior; they
do not establish live PostgreSQL, real-renderer or authenticated UI acceptance.
Full repository verification and hosted CI are recorded separately in the PR.
