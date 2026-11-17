# Direct object editing

This implementation addresses THE-61–66 and records the prerequisite interaction
decision from THE-60. An object is an identified operand in a revision's model-file
composition. It is not an arbitrary connected region of the final STL.

## Priority and evidence

| Interaction                | User value                                    | Effort / risk                                          | Decision                                    |
| -------------------------- | --------------------------------------------- | ------------------------------------------------------ | ------------------------------------------- |
| Selection and apply/cancel | Required to target and safely save every edit | Medium; stale revisions and renderer coordination      | First foundation                            |
| Undo/redo                  | Recover consecutive object edits              | Medium; publication must remain atomic                 | Share the validated edit lifecycle          |
| Move                       | Place parts without source edits              | Medium; distinguish world axes from camera motion      | Numeric mm and direct manipulation          |
| Copy/paste                 | Reuse source as independent objects           | Medium; shared source and global parameters            | Project-only captured payload, distinct IDs |
| Rotate                     | Orient parts                                  | Medium; rotation order and pivot agreement             | Degrees about local origin                  |
| Scale                      | Resize parts                                  | Medium; positive scales and dimensions                 | Uniform and per-axis scaling                |
| Snapping                   | Precise alignment                             | High; no semantic faces/edges in composite STL         | Deferred research                           |
| Text editing               | Add labels to models                          | High; fonts, source parsing and editable text identity | Deferred research                           |

The existing viewer renders one composite STL, so its triangle hits cannot reliably
identify source operands after union, difference or intersection. The file snapshot
already gives each object a stable ID, while each object may share a source file
with other objects. Selection therefore uses those IDs. The selected-object
preview is a separate source render; the accepted composite remains authoritative.

The existing parameter controls demonstrate renderer acquisition, revision-bound
proposals, streamed validation and promotion. The model-file operation API provides
atomic edits against the accepted parent. Both are reused as the editing model;
camera OrbitControls are never a persistence mechanism.

## Transform contract

Objects may carry `transform` with three finite triples: `position` in millimeters,
`rotation` in degrees and dimensionless positive `scale`. Missing transforms mean
identity. Scale is applied first about the file's local origin, followed by X, Y
and Z rotation and then world translation. Negative and zero scales are unsupported.
Limits live in `OBJECT_TRANSFORM_LIMITS` in the contracts package.

Runtime assembly wraps each object's scoped source with
`translate(position) rotate(rotation) scale(scale)`. This affects validation,
accepted preview, exports and restored revision source together. Transforming an
object never rewrites its file or changes other references to that file. Omitted
and explicit identity transforms keep the original assembled source bytes.

Three.js uses `ZYX` Euler order for the equivalent matrix `Rz * Ry * Rx`.
Using its default `XYZ` Euler order would disagree for compound rotations.
The pivot remains the local source origin rather than a moving bounds center.

## Editing and accessibility

The selected name, axes, units and pivot must remain visible. Numeric fields and
ordinary buttons provide keyboard and touch alternatives to a pointer gizmo;
they must not require dragging or WebGL. Scale controls expose both uniform and
per-axis values. Direct manipulation updates a draft and disables camera orbit
for the duration of the drag. A drag does not publish a revision.

Apply proposes against the exact accepted parent, validates/renders, and promotes
only a valid candidate. Cancel discards an unsaved draft and is disabled once
Apply starts. In-flight interruption
must reconcile the accepted revision because cancellation can race publication.
Historical or stale selections cannot silently overwrite a newer accepted model.

Undo and redo submit saved object snapshots through the same guarded lifecycle,
creating new accepted revisions rather than changing immutable history. Only
successful publication moves the undo/redo cursor. A failed edit retains the last
accepted model and its history. New edits after undo clear the redo branch.
External changes invalidate the local editing history so undo cannot overwrite
unrelated edits.

## Copy and paste

`copyModelObject` captures source text, source and object labels, transform,
project identity and the global parameter snapshot. It creates no candidate,
revision or object. The captured payload is detached from later source edits.

`pasteModelObject` validates that payload and creates both a new source file and a
new object. Sharing the old file would make source edits affect the original.
The new IDs are checked for collisions and the whole snapshot is validated before
returning. File/object limits continue to apply. The current composition operation
and its existing operand order remain unchanged; the pasted operand is appended.
This means a pasted difference operand is another subtractor.

The clipboard is limited to the current project and application session. If global
parameter bindings or values have changed since copying, paste asks the user to
copy again rather than silently changing the captured geometry. Labels alone do
not change compatibility. Cross-project/system clipboard transfer, per-object
parameter namespaces, constraints, automatic bed fitting, text editing and snapping
remain outside this release.

## Verification boundaries

Contract regressions check finite bounds, independent source copies, immutable
capture, incompatible payloads, shared-source transforms and identity defaults.
Filesystem and PostgreSQL fixtures check persisted transforms, failed validation,
reload, undo/redo and stale-parent rejection. Those fixture renderers do not prove
geometric accuracy: actual renderer and browser acceptance are recorded separately
in the PR and Linear issues.

Run `pnpm acceptance:object-editing` for pinned Chromium/OpenSCAD geometry checks.
It compares actual STL and 3MF bounds for move, rotation, uniform/per-axis scale,
compound rotation, independent paste, persisted reload and history snapshots.
Browser fixtures additionally exercise actual pointer gizmos, numeric entry,
save retries, bounded refresh recovery, and normal/forced-color layouts.

## Release

Relative to integrated THE-58/THE-59, root and hosted/local plugins advance
0.16.0 → 0.17.0; site 0.14.0 → 0.15.0; contracts 0.8.0 → 0.9.0;
model-project 0.9.0 → 0.10.0; MCP 0.6.0 → 0.7.0; runtime 0.10.0 → 0.11.0;
local-worker 0.7.0 → 0.8.0. Gateway stays 0.7.0. Command pins, local plugin
runtime metadata and generated release identities follow the manifests.
No new migration or renderer pin is introduced; existing migration
`0020_model-files` remains required. Upgrade strict consumers together to read
the optional object transform and new `set_object_transform` operation.

Undo/redo and the clipboard belong to the mounted project session; saved edits
survive reload, while the session's undo cursor and clipboard do not. No production
deployment, public package publication, or authenticated live-user acceptance is
implied by local fixture and renderer checks.
