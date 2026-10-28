# Workspace alignment plan

Parent: [THE-23](https://linear.app/theoryfoundry/issue/THE-23).
Baseline: `master` at `efd6b8f`; template reference `pnpm-ts-template` at `26d3789`.
Keep `apps/site`, all package identities, and `packages/runtime/model-project` in place.
Each stage is a separately verified PR. Do not rename the default branch or deploy as
part of this refactor. Keep THE-15 worker delivery and live acceptance separate.

| Stage | Issue                                                   | Scope and completion gate                                                                                                                                              |
| ----- | ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1     | [THE-24](https://linear.app/theoryfoundry/issue/THE-24) | Guidance, migration inventory, complete test discovery, Node 22 CI, shrinking formatting/naming/size baseline; verify without application changes                      |
| 2     | [THE-25](https://linear.app/theoryfoundry/issue/THE-25) | Move existing scripts into focused tooling folders; workspace-aware architecture enforcement and individually recorded legacy violations; preserve all existing checks |
| 3     | [THE-26](https://linear.app/theoryfoundry/issue/THE-26) | Contracts and rendering modules, public barrels and mirrored tests; preserve asset pins, formats and cancellation behavior                                             |
| 4     | [THE-27](https://linear.app/theoryfoundry/issue/THE-27) | Model-project domain/workflows and persistence adapters; preserve SQL names, transactions, locks, ownership, durability and leases; no new migration                   |
| 5     | [THE-28](https://linear.app/theoryfoundry/issue/THE-28) | Runtime, gateway and MCP features; explicit injection, workflow orchestration and cleanup; preserve HTTP/MCP/stdio contracts                                           |
| 6     | [THE-29](https://linear.app/theoryfoundry/issue/THE-29) | Next.js feature components/hooks, controller adapters and mirrored tests; preserve framework routes and client/server boundaries                                       |
| 7     | [THE-30](https://linear.app/theoryfoundry/issue/THE-30) | Resolve every legacy exception; split oversized files after formatting, finish docs and README; verify without source mutation                                         |
| 8     | [THE-31](https://linear.app/theoryfoundry/issue/THE-31) | Separate Node 24/toolchain PR, flat ESLint and stricter TypeScript, source-only build configs; verify CI and Docker; deployment remains separate                       |

Stages depend on their predecessor. After each merge, rebase the next stage against
current `master`, recheck inventories and reduce the baseline. Record changes to the
plan with evidence rather than moving exceptions to different files.

## Invariants

Preserve package public exports, HTTP/MCP routes and schemas, database identifiers and
migration history, authentication/ownership checks, hashed tokens, artifact formats,
feature flags, renderer asset pins and operational pnpm commands. Generated Codex
installer URL and build/check behavior stay stable when tooling moves. Keep `.mjs`
artifact tests as `.mjs` where they intentionally exercise emitted JavaScript.

## Verification gates

Every stage runs focused regressions and the full `pnpm verify`, with exact PR-head CI
recorded before handoff. Stage 2 tests valid public imports and rejected upward,
service-to-service, forbidden-module, deep-import, alias/barrel bypass, unresolved and
cyclic dependencies. Test type-only edges and re-export symbol resolution explicitly.
Stages 3–6 move tests and adjust build/test inputs with their source; tests must not ship
in library output. Stage 4 also verifies real PostgreSQL concurrency and no generated SQL
changes. Stage 6 checks browser behavior where presentation or lifecycle wiring changes.
Stage 8 verifies built execution and Docker images on Node 24 before any separate rollout.

CI verifies code; branch protection is separately configured GitHub policy. Do not claim
required checks are enforced unless repository settings have been read and confirmed.

## Stage 1 decisions

- Keep Node 22 and existing ESLint/TypeScript settings until stage 8. Pin only the new
  formatter; do not bundle a runtime upgrade into baseline work.
- Introduce new tooling in organized folders now; move pre-existing scripts in stage 2.
- Discover tests recursively, group by closest pnpm workspace owner and preserve cwd.
  This closes the omitted template-leak regression and avoids depth-dependent globs.
- Retain original checks; baseline checks are additive and read-only. No application
  source, SQL, protocol, feature flag, renderer pin or deployment configuration changes.
- Use exact content hashes for formatting exceptions and decreasing line caps; exceptions
  cannot be silently transferred, added or enlarged in later PRs.

See [migration inventory](alignment-inventory.md), [workflow](development-workflow.md)
and [Codex setup](codex-setup.md). Stage-specific verification is recorded in Linear/PRs;
update durable guidance when a stage changes how contributors work.

## Stage 2 implementation

PR #12 completed stage 1 at `3f1df4f`. Stage 2 moves existing scripts into organized
`tooling/` areas with mirrored tests, retaining the original package/client checks.
Resolved workspace and symbol analysis now enforce module/layer rules through aliases,
barrels, declarations and workers. The initial 523 architecture exceptions are verified
against that merged base and assigned to stages 3–6; convention records shrink to 257.
See [architecture enforcement](architecture-enforcement.md) for commands, classification,
bootstrap/ratchet behavior and compatibility evidence. Node 24 remains stage 8.

## Stage 3 implementation

Stage 2 merged in PR #13 at `9faca03`. Stage 3 groups contract schemas, enums, metadata,
ports and inferred types by domain. It separates artifact codecs and browser rendering
capabilities, coordinates rendering in one workflow, and mirrors foundation tests.
Public package entry points, worker host paths and pinned assets remain stable.
See [contracts/rendering alignment](contracts-rendering-alignment.md) for the movement map,
policy refinements and verification gates. Architecture/convention baselines decrease to
383/232; all THE-26 architecture records are removed without retargeting exceptions.

## Stage 4 first slice

Stage 3 merged in PR #14 at `05e0e24`. The first THE-27 slice extracts filesystem
storage capabilities, explicit composition and mirrored regression tests. Public APIs,
durable write order, SQL and migrations remain stable. See
[model-project alignment](model-project-alignment.md) for the movement map and invariants.

Stage 4 remains open: PostgreSQL/worker orchestration and schema-cycle removal need a
follow-on slice that also moves their runtime/HTTP construction sites. Those callers
currently carry stage 5–6 debt; preserve their verified exceptions until the related
wiring can migrate together. Do not widen or retarget baselines. This slice reduces
architecture/convention records to 309/223, including 54 remaining THE-27 architecture
records. The remaining stage order and deployment boundaries are unchanged.

## Stage 4 PostgreSQL/worker completion

The follow-on THE-27 slice starts at merged PR #15 (`440e85f`). It separates project
and worker workflows from injected persistence, removes schema import cycles with
deferred foreign keys, and migrates dependent runtime/HTTP construction sites. All
remaining THE-27 architecture records are resolved without adding or retargeting
exceptions. Earlier filesystem durability guarantees remain covered.

After review and merge, continue THE-28: organize remaining runtime/gateway/MCP
features, finish injection and cleanup boundaries, and mirror their remaining tests.
Some stage 5–6 construction edges are already resolved by this slice; re-read their
remaining baseline records rather than recreating the original inventory. Node 24,
deployment and live acceptance remain separate later work.

## Stage 5 protocol slice

PR #16 completed stage 4 at `d150d96`. The first THE-28 slice organizes gateway
chat and MCP tool dispatch into feature modules, extracts request event telemetry,
and makes runtime MCP connection ownership explicit. Failed startup cleans up
allocated resources while preserving the original error. Existing protocol tests
move to mirrored, focused suites and retain the public transport contracts.

See [gateway/MCP alignment](protocol-alignment.md) for the movement map and
verification gates. Baselines decrease to 144 architecture / 143 convention
records, including 64 remaining THE-28 architecture records. This is a partial
stage: runtime authentication, remote MCP, rendering, export and worker modules
and their remaining test splits still need follow-on work before stage 6.
