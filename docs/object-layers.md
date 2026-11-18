# Object layers (THE-58)

The project workspace Layers panel lists revision-bound named objects in saved
presentation order, including stable object IDs and source file names/IDs. Multiple
objects may use the same file. Legacy single-source projects display an explanatory
empty state; no implicit object splitting or adoption occurs.

Layers opens on the left of the main editor. Parameters opens on the right.
Both use the shared panel disclosure. One panel fits beside the viewport from
780px of editor width, and both fit from 1200px. In narrower editors the panels
follow the viewport in Layers, Parameters order. Object tools stay above it.

Selecting a row name, a visible mesh or an option in the object selector sets the
same project-scoped selection. A saved hidden object keeps its exact transform
fields available. Its mesh and gizmo stay hidden. Row actions leave selection alone.

## Drafts and accepted geometry

Drag a grip with a mouse or touch to preview a move. The list scrolls near its
edges. Drop stages the displayed order. Escape and pointer cancellation leave the
starting order intact. The row menu also supports Move up and Move down. Rename
opens an inline name field. Enter stages a trimmed object label; Escape cancels.
The object ID, source file, and references survive the rename.

Apply layers sends renames, visibility and presentation order in one
`edit_model_files` candidate, validates/renders it, then promotes against the exact
parent. A draft over the tool's 200-operation limit must be split before applying.
The viewer and downloads retain accepted geometry until successful promotion and
refresh. Discard loads the latest accepted layers. List order uses
`presentation.objectOrder`; it never changes the explicit boolean operand order.
Changing visibility excludes hidden objects from the saved preview and exports.

A source-hidden object shows a disabled crossed-out eye. For other objects the
eye button exposes shown/hidden state through `aria-pressed`.
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

This feature builds on THE-57, already integrated into develop. Release versions
relative to that integration base: root/hosted/local plugins 0.14.0 → 0.15.0 and
site 0.12.0 → 0.13.0. Shared package versions carry forward unchanged: contracts
0.8.0, model-project 0.9.0, MCP 0.6.0, gateway/local-worker 0.7.0 and runtime 0.10.0.
Existing migration 0020 is required; this feature adds no migration or renderer pin.
