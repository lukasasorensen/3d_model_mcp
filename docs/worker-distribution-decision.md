# Proprietary worker distribution decision

October 30, 2026; contributes to THE-15. Publication remains blocked. The owner
requires proprietary TheoryFoundry code and public `@tfoundry/local-worker`
distribution. This is an engineering assessment and a prepared handoff, not legal
clearance. No renderer pins or license terms are changed here.

The owner explicitly selected retaining WASM and seeking source provenance plus
licensing clearance on October 30. Native CLI replacement is not the selected
release path. The [WASM clearance packet](worker-wasm-clearance.md) records new
binary metadata, build-image evidence, reviewer questions and a send-ready inquiry.

## Two independent questions

1. Can we supply the corresponding source, dependencies and build materials for
   the exact OpenSCAD binary we redistribute?
2. Is the delivered integration compatible with keeping TheoryFoundry proprietary?

Solving the first question does not settle the second. `UNLICENSED`, a public npm
organization, or relocating the binary to a setup-time download does not establish
compatibility for the delivered combination.

## Confirmed evidence

[OpenSCAD identifies its license as GPL version 2](https://openscad.org/about.html#license).
The exact archive remains `OpenSCAD-2026.07.20-WebAssembly-web.zip`, SHA-256
`8b81d3d025f29bc1dec40a2ce5acbad5bd06a0f568c1bfa1f6572ad5baa97dcd`.
The official [snapshot index](https://files.openscad.org/snapshots/) lists the web
archive at 3,298,833 bytes with a signature and checksums, but no corresponding
source archive for that dated snapshot. The official checksum was fetched again.

The pinned binary's `--info` now reports `git e4fdec49`, which resolves to
[`e4fdec49730103274a4e21c2390b9a12882f01aa`](https://github.com/openscad/openscad/commit/e4fdec49730103274a4e21c2390b9a12882f01aa).
Its [COPYING file](https://github.com/openscad/openscad/blob/e4fdec49730103274a4e21c2390b9a12882f01aa/COPYING)
contains a CGAL linking exception while retaining GPL requirements for the rest
of the executable. It does not establish an exception for TheoryFoundry.
Its [CircleCI configuration](https://github.com/openscad/openscad/blob/e4fdec49730103274a4e21c2390b9a12882f01aa/.circleci/config.yml)
establishes these distinctions:

- Snapshot jobs check out Git and recursive submodules and use the mutable
  `openscad/wasm-base-release:latest` build image.
- The WASM build passes `OPENSCAD_COMMIT` and `OPENSCAD_VERSION` to CMake and
  archives `openscad.*`. That describes a mechanism, not the identity of the
  build that produced our pinned archive.
- The tag-release workflow separately creates a source archive with recursive
  submodules, `VERSION.txt` and `COMMIT.txt`, then builds from that archive.
  The snapshot workflow does not invoke that source-archive job.
- The public GitHub status response for the candidate commit had no build links.
- Public CircleCI successful master-build pagination was checked through its end:
  offset 500 returned four entries, the oldest on August 1, 2026; offset 600 was
  empty. The July 20 build was not available through that listing. This does not
  prove the build records are unavailable elsewhere.
- The packaged WASM had no `producers`, `sourceMappingURL` or `build_id` custom
  section. Those earlier static checks did not establish its exact source or build
  image. The subsequent runtime probe and current registry digest are recorded in
  the clearance packet; full corresponding-source verification remains incomplete.

## Actual integration boundary

TheoryFoundry's `openScadWorker.service.ts` dynamically imports the upstream
Emscripten JavaScript module, instantiates it with WASM bytes, writes source and
BOSL2 through its `FS` API, calls `callMain`, and reads the resulting model bytes.
The outer browser worker exchanges messages, but the inner integration uses
direct calls into the OpenSCAD module in the same JavaScript worker.

The [GNU FAQ on aggregation](https://www.gnu.org/licenses/gpl-faq.html#MereAggregation)
distinguishes independent programs from combined programs by both communication
mechanism and semantics. Its guidance treats shared-address-space linking
differently from ordinary process/command-line communication, while noting that
even a process boundary is not conclusive on its own.

Engineering inference: we cannot claim the current integration is mere aggregation
because it runs in a browser worker or because setup downloads the binary. Review
the actual direct module interface with someone qualified to resolve licensing.
Do not publish this combined candidate on an assumption of compatibility.

## Paths that preserve the owner's decision

| Path                                                            | What must be established                                                                                 | Engineering impact                                                                                                            |
| --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Retain the pinned WASM integration                              | Exact source/build delivery and a reviewed basis permitting proprietary distribution of this integration | No renderer change; publication stays blocked until both questions are answered                                               |
| Use OpenSCAD as an independently installed command-line program | Reviewed independent-program boundary and an exact supported upstream installation/version               | New renderer adapter, packaging/cache changes, cancellation checks and full Codex acceptance; not authorized by this document |
| Obtain an applicable licensing exception                        | Written permission covering the relevant copyrighted components and distribution                         | Availability is unknown; no exception has been requested or assumed                                                           |

The CLI path is a candidate for reducing coupling, not a legal conclusion. Prefer
ordinary SCAD input and STL/3MF files across a process boundary; avoid sharing
internal object structures. Independently installed upstream software may avoid
redistributing its binary in npm, but the precise installation and integration
must still be reviewed. Changing the renderer pin requires an explicit decision
under the existing release plan, followed by new provenance and acceptance.

## Prepared upstream inquiry — not sent

The updated [inquiry and review checklist](worker-wasm-clearance.md) includes the
binary's reported revision and the base-image candidate. Recipient: OpenSCAD's
official general-inquiry address. No message has been sent; sending requires the
owner's instruction. Do not disclose proprietary source in a public issue.

The source inquiry is separate from review of the proprietary integration. Before
publication, retain a written resolution of both questions, complete the source
and notice delivery it requires, and rebuild/inspect/test the exact final tarball.
