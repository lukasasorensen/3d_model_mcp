# OpenSCAD redistribution source audit

Status: unresolved; npm publication is blocked. Renderer pins remain unchanged.
This records evidence and missing materials, not a legal clearance.
The October 30 [distribution decision and upstream handoff](worker-distribution-decision.md)
records the current integration boundary, additional build-history investigation,
and paths that retain proprietary TheoryFoundry code. The handoff has not been sent.

The bundled web snapshot is [OpenSCAD 2026.07.20](https://files.openscad.org/snapshots/OpenSCAD-2026.07.20-WebAssembly-web.zip),
SHA-256 `8b81d3d025f29bc1dec40a2ce5acbad5bd06a0f568c1bfa1f6572ad5baa97dcd`.
The official snapshot index lists the binary, detached signature and hash files.
The package already includes the upstream GPL text; that alone does not supply
matching source and build materials.

The pinned WASM now directly reports `2026.07.20 (git e4fdec49)` through `--info`.
GitHub resolves that prefix to
[`e4fdec49730103274a4e21c2390b9a12882f01aa`](https://github.com/openscad/openscad/commit/e4fdec49730103274a4e21c2390b9a12882f01aa).
This is stronger evidence than the earlier timestamp/Windows-report inference.
The [WASM clearance packet](worker-wasm-clearance.md) records the repeatable probe,
library versions and remaining limits: self-reported metadata does not identify
every dependency source, local patch, or the original build job.

The candidate's [.circleci/config.yml](https://github.com/openscad/openscad/blob/e4fdec49730103274a4e21c2390b9a12882f01aa/.circleci/config.yml)
describes the `openscad-wasm` job and web build commands. Its executor references
`openscad/wasm-base-release:latest`. The follow-up packet identifies a current
immutable digest whose creation predates the snapshot, but its use by that job and
the exact dependency sources remain unconfirmed. The GitHub commit status query did not return
a matching CircleCI artifact record. Do not treat a generic repository URL or a
date-matched source archive as a resolved source offer.

Before distribution, establish the exact snapshot-to-source/build association,
collect required source including pinned submodules/dependencies and build scripts,
review their licenses/notices, and arrange the required source delivery alongside
the binary. Record stable URLs, digests and verification evidence. If the original
build cannot be established, an explicit renderer-pin change with a reproducible
build and new acceptance is a separate decision; this work does not silently switch
the renderer. The owner selected proprietary TheoryFoundry code. Resolve whether
the delivered combination is compatible with that choice; do not silently
relicense TheoryFoundry or assume a separate npm download resolves the issue.

BOSL2 v2.0.741 is already shipped as its complete pinned source archive with LICENSE.
Three.js and fflate notices are bundled; runtime npm dependencies retain their own
notices. Review the final dependency inventory with the exact release tarball.
