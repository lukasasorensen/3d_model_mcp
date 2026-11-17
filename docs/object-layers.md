# Object layers (THE-58)

The project workspace Layers panel lists revision-bound named objects in saved
presentation order, including stable object IDs and source file names/IDs. Multiple
objects may use the same file. Legacy single-source projects display an explanatory
empty state; no implicit object splitting or adoption occurs.

Select an object independently of its visibility. The selected row and its details
remain identifiable while hidden. Selection belongs to the panel and resets on reload;
the composed STL preview does not support per-object mesh picking or highlighting.
Native buttons and checkboxes support keyboard selection, visibility and move-up/down
without requiring drag gestures. Long names wrap at mobile widths.

## Drafts and accepted geometry

Show/hide and reorder stage a draft. Apply creates an immutable candidate through
`edit_model_files`, validates/renders it, then promotes against the exact parent.
The viewer and downloads retain accepted geometry until successful promotion and
refresh. Discard loads the latest accepted layers. List order uses
`presentation.objectOrder`; it never changes the explicit boolean operand order.
Changing visibility excludes hidden objects from the saved preview and exports.

A source-hidden object shows an unchecked, disabled effective visibility checkbox.
Show source file stages visibility for every object referencing that file, while
preserving each object's independent hidden state. The panel explains this shared
scope before the control. Individually hidden objects remain selectable.

Empty saved geometry is unsupported by the existing renderer/artifact contract.
The panel requires at least one effectively visible object, and requires the original
first operand of a difference to remain visible. Invalid or empty OpenSCAD results
still fail renderer validation and retain accepted state. It never substitutes a
subtractor for a hidden difference base. Direct transforms, grouping, boolean editing,
and file body editing are outside the panel.

Historical snapshots remain selectable but read-only. A concurrent accepted revision
retains and disables an older draft until discarded; it is not silently rebased.
Failures preserve the draft. Interrupted retries retain exact request identity, and
cancellation checks the accepted outcome because promotion can already have committed.
Refresh waiting is bounded and cancellable; an incomplete refresh does not claim that
the preview matches the saved layers.

## Boundaries and verification

`/v1/projects/:projectId/layers` authenticates all reads and writes, checks origin and
session identity for mutations, bounds JSON input, and opens an owner-scoped runtime.
Reads return metadata without file bodies and bind the snapshot to revision/source
hash. Mutation events use the bounded sequence/request/session-checked NDJSON protocol.

Browser fixtures exercise real controls with keyboard input, forced colors, reduced
motion, mobile reflow, persisted reload, hidden selection, shared-file recovery,
history, stale drafts, rejection, cancellation and interrupted retries. Filesystem and
PGlite HTTP/MCP integration tests exercise actual proposal/render/promote lifecycle,
retry identity, historical reads, ownership isolation and competing writers. These
fixtures do not claim authenticated production or assistive-technology acceptance.

This PR includes the shared THE-57 contract/MCP commits so it can be verified independently
against develop. Release versions relative to develop: root/plugins 0.13.0 → 0.14.0,
contracts 0.7.0 → 0.8.0, model-project 0.8.0 → 0.9.0, MCP 0.5.0 → 0.6.0,
gateway/local-worker 0.6.0 → 0.7.0, runtime 0.9.0 → 0.10.0, site 0.11.0 → 0.12.0.
Existing migration 0020 is required; this feature adds no migration or renderer pin.
Restack and recheck once-per-PR versions before merging dependent work.
