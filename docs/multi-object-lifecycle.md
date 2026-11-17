# Multi-object rendering, restoration and export (THE-59)

The preview and download use the exact source of an accepted revision. Applying
file or object changes creates a candidate; validation and promotion must succeed
before those changes affect the current model or its downloads. Selecting a
historical revision changes inspection only. Restore creates a new current
revision from that historical snapshot, after which downloads use the restored
composition. Unapplied changes never enter a download.

## Visibility and composition

Version 2 model files persist explicit file/object display order and hidden IDs.
Hiding a file hides every object that references it. Hiding an object hides only
that object. Hidden objects are omitted from both the composed preview and export;
their editable bodies and stable identities remain in the revision snapshot.

Union and intersection operate on the remaining visible operands. Difference
keeps its original first object as the base and subtracts the remaining visible
operands in composition order. Display order never changes the Boolean operation
or its operand order. The existing STL, 3MF and browser GLB export paths continue
to use the accepted source; this change adds no formats.

The current renderer requires a nonempty mesh. Applying a snapshot that hides
every object, or hides the original difference base, fails with an actionable
`INVALID_MODEL_FILES` error. It never promotes a subtractor to become the base.
Keep at least one object visible and keep the difference base visible. A Boolean
operation that otherwise produces empty or invalid geometry still fails renderer
validation. In every case the last accepted revision and its exports remain intact.

## Revision integrity

Restore copies files, object/file identities, labels, bodies, composition,
presentation order, visibility, parameters and exact historical source together.
The new revision references the existing validated artifact content with its new
revision identity. It does not reassemble historical source using current rules.
Version 1 assembly remains frozen; old source hashes and historical reads stay
unchanged. PostgreSQL and filesystem adapters retain existing ownership,
transaction and publication boundaries. No database migration is added beyond
the existing `0020_model-files` prerequisite.

## Verification

`pnpm acceptance:model-files` exercises the pinned sandboxed Chromium/OpenSCAD
renderer on ten compositions, including union, difference, intersection, an
internal cutout, parameter changes, hidden files, hidden objects and presentation
reordering. Each accepted revision is exported again from its stored source, whose
hash is checked before rendering. Both generated downloads and persisted artifacts
are parsed independently for STL/3MF volume; generated downloads also verify
bounding boxes. The internal cutout has unchanged outer bounds but volume 850 mm³
instead of 1000 mm³, so a missing subtraction cannot pass on bounds alone.

The harness restores both v1 and v2 snapshots and checks complete metadata, exact
source bytes, artifact hashes and regenerated geometry. Five invalid compositions
and invalid OpenSCAD syntax leave the accepted revision unchanged. Output files
and `report.json` are saved under `dist/model-files-acceptance/`.

Focused filesystem and PGlite regressions verify restored identity, visibility,
order, source and artifact revision bindings. Browser integration verifies that
inspecting older geometry still exports the current accepted source, and that a
restore changes the download to the restored composition. Browser service fixtures
test revision selection and integrity; the separate Chromium acceptance checks
actual geometry. PGlite is fixture evidence, not live PostgreSQL acceptance.

The November 17, 2026 local acceptance passed all ten compositions in both formats,
both restores, five invalid compositions and invalid syntax. The two lifecycle
regressions and both browser modes passed. Hosted CI, deployment and authenticated
live acceptance are separate checks.

## Release versions

THE-59 follows the integrated THE-57 model-file foundation and THE-58 layers panel.
Relative to that integration base, root/hosted/local plugins move 0.15.0 → 0.16.0
and site moves 0.13.0 → 0.14.0. Shared versions carry forward unchanged: contracts
0.8.0, model-project 0.9.0, MCP 0.6.0, gateway/local-worker 0.7.0 and runtime
0.10.0. Renderer packages and asset pins are unchanged. THE-57 and THE-58 retain
their release history in their respective documentation.
