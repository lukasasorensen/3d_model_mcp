# Revision-bound model files (THE-56)

Projects can store a versioned `modelFiles` snapshot alongside their exact validated
OpenSCAD source. Each file has a stable ID, display name and editable body. Each
object has a separate stable ID, display name and `fileId`. Names are labels, never
filesystem paths. Renaming or reordering the file/object collections preserves IDs.
IDs are supplied by the caller and must be retained when editing the same entity;
the server does not infer identity from names or geometry.

## Proposal and composition

The existing proposal operation accepts exactly one of legacy `source`, generated
`modelBody`, or `modelFiles`. For example:

```json
{
  "projectId": "example",
  "parentRevision": null,
  "modelFiles": {
    "version": 1,
    "files": [
      { "id": "base-file", "name": "base.scad", "body": "cube([20,10,5]);" },
      {
        "id": "hole-file",
        "name": "hole.scad",
        "body": "translate([5,2,-1]) cube([5,6,7]);"
      }
    ],
    "objects": [
      { "id": "base", "name": "Base", "fileId": "base-file" },
      { "id": "hole", "name": "Cutout", "fileId": "hole-file" }
    ],
    "composition": {
      "operation": "difference",
      "objectIds": ["base", "hole"]
    }
  },
  "requestId": "request-1",
  "toolCallId": "tool-1"
}
```

Version 1 supports one explicit `union`, `difference`, or `intersection` over an
ordered list of object IDs. Every object occurs exactly once. Difference subtracts
later operands from the first. Object/file collection order has no geometric effect;
only the explicit composition order does. Multiple objects can refer to the same
file, and unused files remain in the snapshot. Nested CSG trees, per-object transforms,
visibility, selection, layer controls and dedicated AI file-management tools are
outside this foundation; THE-57–59 and the modeling-tools project own those flows.

Files are self-contained OpenSCAD bodies, each enclosed in its own `union()` block.
This keeps local declarations separate and makes each object's geometry one CSG
operand. Explicit `fileId` references supply composition; project-path imports and
`include`/`use` directives are unsupported in multi-file bodies, including BOSL2
imports. Legacy single-source library behavior is unchanged. Bodies must have balanced
delimiters and terminated strings/comments so they cannot escape the generated
scope. Existing source-reference restrictions apply to every file, including unused
files. The renderer still decides OpenSCAD syntax and geometry validity.

The frozen v1 assembly is `operation() {\n` followed by each ordered object's
`union() {\nBODY\n}` joined with LF, then `\n}`. Bodies are retained byte-for-byte;
inserted LF prevents a trailing line comment swallowing a closing brace. IDs and
names never enter generated code. Files and objects are canonicalized by ID for
retry identity; composition order is retained. Parameter JSON generates the existing
read-only header before this assembled body. Both snapshot JSON and assembled source
are bounded independently to 256 KiB, with at most 64 files and 100 objects.

## Lifecycle, reads and compatibility

Proposal resolution captures the full snapshot, body, parameters and exact source
before validation. Missing/duplicate file or object references, invalid composition,
invalid bodies and snapshot bounds fail clearly before persistence. Parameter binding
checks cover all file bodies. The named parent's parameter snapshot is inherited
when omitted, exactly as for single-body documents.

The existing candidate → validate/render → promote lifecycle accepts files and
composition atomically with source, parameters and artifacts. Failed/cancelled renders,
stale promotion and interrupted publication preserve accepted state. Retry identity
includes the full snapshot, so label-only changes cannot reuse a different candidate
even when source hashes match. Restore copies the historical snapshot and exact source;
it does not regenerate historical bytes under new proposal rules. Reads verify stored
snapshot assembly against the stored body/source. PostgreSQL ownership and transaction
boundaries, filesystem locks, durable revision publication and atomic CURRENT remain.
The filesystem adapter remains a trusted local workspace boundary, not multi-tenant
storage; filenames are never materialized from user labels.

`read_model_source` returns `modelFiles` plus parameters for multi-file revisions,
`modelBody` plus parameters for generated single-body revisions, or legacy `source`.
`sourceHash` always identifies the complete stored render input. Internal repository
reads retain assembled source/body for rendering. Mutation replies and history omit
file bodies/snapshots to keep responses bounded. Existing parameter controls remain
editable; `edit_parameters` preserves the entire snapshot and rejects a body override
on multi-file parents. File-body or binding-name changes require a complete proposal.
Chat treats file bodies as source data and includes them in its existing redaction.

Legacy records stay unchanged with no automatic file splitting. Supplying a complete
`source`/`modelBody` proposal explicitly replaces the current document mode; older
revisions retain their files. Older strict clients must upgrade before reading or
editing multi-file documents. Dedicated file-management tools and a layers UI are
not added by this change.

## Migration and versions

Apply additive migration `0020_model-files` after existing migrations before server
startup. It adds nullable JSONB `model_files` columns to candidates and revisions.
Existing rows, hashes, revisions, SQL ownership and artifact records are unchanged.
No renderer pins, environment variables or new tables are introduced.

Once-per-PR versions relative to develop: root/hosted/local plugins 0.12.2 → 0.13.0;
contracts 0.6.1 → 0.7.0; model-project 0.7.1 → 0.8.0; MCP 0.4.1 → 0.5.0;
gateway/local-worker 0.5.1 → 0.6.0; runtime 0.8.1 → 0.9.0; site 0.10.2 → 0.11.0.
Worker/client pins and generated MCP metadata follow the manifests. Publication,
deployment and authenticated live acceptance remain separate from this PR.

## Verification

Filesystem and PGlite regressions exercise legacy adoption, canonical retries,
metadata-only changes, composition order, parameter edits, reopen, historical reads,
restore, cancellation, stale promotion, failed publication, corruption and foreign-owner
access. MCP integration exercises actual client/server serialization, compact mutation
replies, snapshot reads and parameter edits. PGlite is fixture evidence, not a live
PostgreSQL deployment.

`pnpm acceptance:model-files` exercises the pinned sandboxed Chromium/OpenSCAD renderer,
parses both STL and 3MF bounds independently, promotes four union/difference/intersection
and parameter-change cases, and restores the original snapshot/source. The local run
passed on November 16, 2026 with OpenSCAD 2026.07.20, BOSL2 v2.0.741 and Chromium
149.0.7827.55. File-local declarations stayed isolated. Report:
`dist/model-files-acceptance/report.json`. Full verification and CI are recorded in the PR.
