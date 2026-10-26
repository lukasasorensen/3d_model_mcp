# Workspace architecture enforcement

Stage 2 ([THE-25](https://linear.app/theoryfoundry/issue/THE-25)) builds on
Stage 1 merged in PR #12 at `3f1df4f`. Application source, SQL and runtime versions
remain unchanged. The [target architecture](architecture-conventions.md) and
[remaining stages](alignment-plan.md) still govern the structural migration.

## Commands and implementation

- `pnpm check:architecture` checks the resolved application graph and the shrinking
  per-violation baseline. It runs inside `pnpm verify`, before package builds.
- `pnpm test:architecture` runs architecture/baseline fixtures and the retained package
  boundary regressions. `pnpm test:tooling` recursively runs all root tooling tests,
  including the nested headless-renderer asset-server tests.
- `pnpm check:boundaries` retains the original package dependency allowlist, browser
  restrictions, gateway/MCP bypass checks and built-client canaries. It still runs
  before and after the build. New graph checks supplement these established checks.

TypeScript resolves each file with its owning project's configuration, including
Next.js aliases and TSX. A workspace's public `exports` entries map emitted `.js` and
`.d.ts` paths back to source using `rootDir`/`outDir`. No library build is required to
inspect service origins. Explicit project aliases remain authoritative and are checked
against actual public entries, so aliasing a package name to an internal file fails.
Nested packages are assigned to their closest workspace root.

The symbol checker follows selected named exports through re-exports. Importing a
contract from a mixed public API does not imply importing its services. Namespace and
dynamic literal imports expose the entire API and are checked conservatively. Type-only
imports and re-exports still count for architecture and cycles. Legacy indexes containing
implementation cannot hide peer services; their declared interfaces remain contracts.

Dependency-cruiser independently checks cycles and unresolved dependencies under each
project's aliases/export conditions. The semantic graph also checks file and conceptual
module cycles: two modules can depend on one another without a cycle among individual
files. The checks reject unresolved imports, require/import-equals, nonliteral dynamic
imports, upward layers, peer services/controllers/workflows, forbidden module directions,
deep imports, source-to-tests and imports of tooling or emitted output. Diagnostics name
the file, rule, target and correction.

Client directives and browser-safe packages seed a transitive runtime graph. It follows
local aliases, public barrels, dynamic literal imports and worker references created by
`new URL(..., import.meta.url)`. Erased type-only edges do not pull server implementations
into that browser graph. Node APIs, known server packages and provider SDKs are rejected
when reachable at runtime. The existing built-bundle canary check remains necessary.

## Layer classification

Named controllers/workflows/services/utils/types folders and role suffixes supply layers.
Repository, adapter, client, renderer and worker roles are capabilities at the service
level, so a service cannot import one to bypass peer-service restrictions. Policies,
metadata, constants, schemas and enums are lower-level utility modules. `.types` and
`.port` files cannot contain runtime implementation.

React components may compose components/hooks; hooks may compose hooks and lower layers.
They are presentation adapters, not an exemption for importing server implementations.
Next.js framework entries are composition boundaries. Other explicit `.composition` or
`.factory` entries must be at the package source root; public indexes only re-export.
Legacy flat files that lack a layer are individually recorded, not silently assigned a
permissive layer. Folder-based module classification becomes more specific as stages
3–6 introduce meaningful domain/feature/infrastructure/shared modules.

Current configuration supports explicit public export subpaths and TypeScript aliases
that are literal or end in `/*`. Unsupported patterns fail with a configuration diagnostic
rather than bypassing checks. Root tooling uses its own execution concerns and is checked
by lint, conventions and tests; application layer policies analyze package/application
`src/`. Test/fixture code is not a production graph root, and production imports of it fail.

## Baselines

`tooling/architecture/legacyArchitecture.generated.json` initially records **523** existing
violations, each with a source file, rule, target, owning stage issue and reason. This
includes 94 unclassified files, 409 layer edges, six implementation-bearing barrels, one
own-barrel import, one dynamic asset loader, and existing cycle reports (eight semantic
edges plus four dependency-cruiser cycle reports). There are no baselined unresolved
imports or browser/server violations.

The bootstrap compares against an archived copy of `3f1df4f`, using the installed dependency
tree for resolution without modifying that checkout. Subsequent PRs compare the committed
baseline at `ALIGNMENT_BASE_REF` (CI event base; locally `origin/master`). An exception may
be removed, but not added, retargeted or transferred to another file/rule. Resolved entries
must be removed. Missing Git history fails closed. There is no regeneration command.
The formatting/naming/size baseline shrank from 280 to **257** records during tooling moves.
Both baseline JSON files are generated migration metadata exempt from the 500-line cap;
handwritten tooling and tests remain below it. Stage 7 must empty both baselines.

The pinned OpenSCAD loader remains a single, explicitly recorded nonliteral-import debt
item. This stage preserves its asset hashes and behavior; it does not create a general
exemption for dynamic application imports. Persistence/runtime cycles and large mixed
modules belong to their existing stage issues, not unrelated cleanup in this PR.

## Tooling moves and compatibility

| Previous area                | Current area                                             |
| ---------------------------- | -------------------------------------------------------- |
| Package-boundary checker     | `tooling/architecture/checkPackageBoundaries.script.mjs` |
| Template-leak checker        | `tooling/conventions/checkTemplateLeaks.script.mjs`      |
| Database shell               | `tooling/database/databaseShell.cli.mjs`                 |
| Browser asset preparation    | `tooling/browser-renderer/prepareAssets.script.mjs`      |
| Codex installer source/build | `tooling/codex-connect/`                                 |
| Headless rendering proof     | `tooling/headless-renderer/`                             |
| Colocated script tests       | Mirrored `tests/tooling/` paths                          |

Operational pnpm command names and generated installer/proof output locations stay the
same. The installer's regenerated source annotations change; its minified executable code
matches the previous bundle. Installer tests and reproducibility checks remain active.
The headless proof build uses the moved browser/worker/CLI inputs and unchanged pinned assets.
The Dockerfile still invokes stable pnpm commands; its existing checks continue to work
without Git checkout metadata. Full baseline ratchets run in checkout CI. Snapshot tests
requiring a Git executable explicitly skip in images without it; ordinary graph tests run.
