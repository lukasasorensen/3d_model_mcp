# Working model and revision saves

The main editor holds one draft across Parameters, Layers, and object tools. The
viewport rebuilds exact geometry after the input settles. During a gizmo drag it
shows the individually transformed operands. Invalid fields or geometry keep the
last usable preview visible and disable **Save new revision**. Undo and Redo apply
to the whole draft. The saved revision and its downloads remain available while
editing.

The revision controls stay within reach at the bottom of the editor as you
scroll. Discarding the draft or undoing back to the saved model clears the
draft preview.

The draft is scoped to the signed-in account and project in the current browser
tab. Returning to the project or reloading that tab restores the values and
rebuilds the preview. Browsing revisions suspends the draft until you return to
it. If another writer advances the project, the stale draft is read-only. Use
**Discard draft and open latest** to start from the new saved revision.

The authenticated preview endpoint reads the named parent, applies edits, and
assembles and checks the exact OpenSCAD source. It creates no candidate or
revision records. The browser checks the source hash and renders in its pinned
worker, using the last successful preview while new work runs. Save validates an
immutable candidate and promotes it only against its original parent. Retries
reuse the same request identity and reconcile against revision history.

The preview cache retains up to eight successful renders with a 20 MiB mesh
budget. Cache hits retain renderer diagnostics for browser validation. Draft
identity also includes non-geometric changes such as layer names and order.

Release 0.21.0 uses the existing revision schema and renderer assets. There is no
database migration.

## Local renderer timing

A loopback harness exercised the draft API and pinned OpenSCAD worker in
headless Chromium at a 390px viewport. Edit-to-visible includes the 200ms delay,
a fresh mesh render, and a WebGL frame. The Save samples compare a cached mesh
with a separate renderer instance using the same assets. Each Save produced one
revision in the filesystem repository.

| Fixture              | Edit to visible | Save with cached mesh | Save with fresh mesh |
| -------------------- | --------------: | --------------------: | -------------------: |
| Box                  |      473–476 ms |                135 ms |               331 ms |
| Perforated enclosure |      558–574 ms |                134 ms |               448 ms |
