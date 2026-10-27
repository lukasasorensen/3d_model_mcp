# Contracts and rendering alignment

Stage 3 is tracked by [THE-26](https://linear.app/theoryfoundry/issue/THE-26), based on
stage 2 merged as `9faca03` in PR #13. Package identities and public root exports remain
stable. Node 24, site feature migration, persistence refactoring and deployment are later work.

## Responsibilities and dependency direction

| Package          | Structure and responsibility                                                                                                                                                                                                                        |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| contracts        | `domains/cad`, `chat`, `preview`, `worker`, `project-events`, and `observability`; schemas validate runtime data, enums/constants define bounded metadata, types infer the schemas, ports declare capabilities; shared version/envelope foundations |
| browser-renderer | Root factories/composition wire a rendering feature's independent services into one rendering workflow; pure STL summary utility and explicit data/port contracts                                                                                   |
| renderer         | Artifact domain with binary STL, 3MF, ZIP reading/writing/ZIP64, CRC, bounds and topology utilities; pure public barrel                                                                                                                             |

Domain barrels only re-export. Internal imports target specific files. Cross-domain
consumers use domain indexes; shared metadata has no dependency back into domains.
Validation types derive from schemas with erased imports, so strict validation and
public TypeScript contracts retain one source of truth. These are data dependencies,
not permission to import service implementation types.

The rendering factory constructs worker compilation, mesh cache, PNG presentation and
download conversion services, then injects them into `rendering.workflow.ts`. The
workflow owns sequencing and source-hash verification. Services own single capabilities
and never import peers. Worker registration has its own composition entry, and importing
the public package still creates no worker or global handler.

The worker's OpenSCAD import now names its fixed asset path directly in the URL expression.
Asset origin remains host-supplied, and JavaScript/WASM/BOSL2 hashes are checked before
module execution. The architecture graph models this one runtime resource explicitly;
see [architecture enforcement](architecture-enforcement.md) for exact restrictions.
The site's existing renderer and worker bootstrap paths remain composition entry points
until their owning stage; this stage does not move UI state or routes.

## Compatibility and test movement

- The contracts package preserves all 104 runtime export names and constant/pin values.
  Runtime schemas retain strictness, defaults, bounds, refinements, and error definitions.
  Root declaration exports and downstream consumers continue to typecheck.
- `createBrowserCadRenderer`, its five methods, metadata, MIME values, worker installer,
  STL summary and option types remain available through the browser package root.
- The artifact package preserves `parseBinaryStl`, `parseThreeMf`, `bindThreeMfSource`,
  `ParsedMesh` and `RENDERER_BOUNDARY`. Format validation and source binding remain intact.
- Contracts tests now exercise the public barrel from `tests/index.test.mjs`.
  Browser tests mirror the factory and rendering workflow. Artifact tests mirror 3MF
  utilities, with the unchanged binary fixture under `tests/fixtures/`.
- The runtime worker export regression's fixture path follows that relocation. No other
  runtime application source, HTTP/MCP schema consumers, SQL or deployment files move.
- Existing unbounded per-renderer mesh-cache behavior is preserved. Cache lifecycle and
  worker supervision enhancements remain separately scoped work.

## Verification and remaining debt

Run `pnpm verify` for the complete workspace, then build and execute the headless renderer
proof. Focused coverage checks strict contract validation, source-bound rendering,
cancellation, cache isolation, dependency failure propagation, asset integrity rejection,
large vertex tables and corrupt ZIP64 metadata. Architecture regressions cover erased
schema/constant type dependencies while still rejecting peer implementations and unknown
runtime resources. The built proof checks STL/3MF geometry, seven PNG views, BOSL2,
nontrivial models, model rejection, cancellation/recovery and packaged local assets.

Clean foundation builds must contain no tests or binary test fixtures. Verification must
leave tracked source unchanged. Record execution results and exact-head CI in Linear/PRs.
No production deployment, real PostgreSQL acceptance or feature-flag enablement is implied.

All 35 stage-owned architecture violations are resolved. The overall architecture baseline
shrinks from 523 to 383, including legacy consumer edges that now point to valid foundations;
no exception is added or retargeted. Convention records shrink from 257 to 232. All new
handwritten files are under 500 physical lines. Remaining records stay assigned to THE-27,
THE-28 and THE-29 and must be eliminated by the final enforcement stage.
