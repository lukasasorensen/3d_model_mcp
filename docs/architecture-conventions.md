# Architecture conventions

This is the target adopted from `pnpm-ts-template` at commit `26d3789`.
The [product architecture](architecture.md) describes current behavior;
[the migration plan](alignment-plan.md) distinguishes implemented checks from future work.
Preserve workspace and deployment boundaries. Add meaningful domain or feature modules
inside each owning package as that package migrates, not an empty copy of the template.

## Dependencies must satisfy both boundaries

| Module         | Permitted direction                                                                        |
| -------------- | ------------------------------------------------------------------------------------------ |
| Features       | Domain public APIs and shared foundations, subject to layers                               |
| Domains        | Domain contracts, lower layers, shared foundations; no features or concrete infrastructure |
| Infrastructure | Domain-owned contracts and shared foundations; no domain services or orchestration         |
| Shared         | Shared contracts and acyclic utilities only                                                |

| Layer           | Responsibility and dependencies                                                                       |
| --------------- | ----------------------------------------------------------------------------------------------------- |
| Controllers     | Validate unknown input, call one service or workflow per operation, translate results; no controllers |
| Workflows       | Sequence multiple services; lower layers only, no workflows                                           |
| Services        | One cohesive capability; contracts, ports and utilities only, no services in any module               |
| Utilities       | Pure operations; types and acyclic utilities only                                                     |
| Types and ports | Data and capability contracts without implementation dependencies                                     |
| Composition     | Construct and connect components, startup/shutdown and resource cleanup                               |

Type-only imports and re-exports are dependencies. Public barrels cannot hide forbidden
layers. All cross-module dependencies use public re-export-only `index.ts` APIs and
remain acyclic; internal files never import their own barrel. Domain-owned contracts
sit beside the domain index, such as `candidate.types.ts` or `candidateStore.port.ts`.
Reserve `shared/types` for genuinely shared contracts. Never turn peer business services
into injected ports merely to bypass layering. Infrastructure implements narrow ports.

A package's public index remains a barrel. Existing runtime startup/CLI and Next.js
entry points are explicit composition boundaries, not a reason to put business logic
in a package index. Create `workflows/` only when a real operation coordinates services.
In React features, components and hooks are presentation adapters; they must not import
server implementations. Keep Next.js client directives and server boundaries explicit.

## Files and tests

Use kebab-case folders and camelCase file stems with role suffixes. Match the layer even
inside a matching folder (`controllers/createCandidate.controller.ts`). Additional
existing roles such as `.schema.ts`, `.repository.ts`, `.renderer.ts`, `.component.ts`,
`.hook.ts`, `.adapter.ts`, `.worker.ts`, `.client.ts`, `.fixture.mjs` and `.script.mjs`
remain useful when the responsibility is explicit. Preserve framework route filenames,
root configuration conventions and public indexes. New tests mirror source paths under
the owning project's `tests/`, omitting `src/`, keeping the full implementation stem.
Tests of built TypeScript may remain `.test.mjs`. Root tooling tests mirror `tooling/`.
Integration scenarios should use a descriptive `.integration.test.*` name.

Every handwritten file is at most 500 physical lines, including blank lines, tests and
documentation. Split by responsibility. Comments explain intent; long explanations live
in `docs/`. The generated installer, Next's `next-env.d.ts`, lockfile, generated baseline,
immutable Drizzle migration history, dependencies and build artifacts are exempt.
The installer retains its own reproducibility check. Exemptions are exact paths or
known artifact directories, not arbitrary `.generated.*` suffixes.

## Enforcement rollout

Stage 1 checks formatting, role/layer naming, folder case, test placement and file length.
Legacy exceptions are per-file records in `tooling/conventions/legacyBaseline.generated.json`:

- `formatHash`: only the exact unformatted legacy content is accepted. Editing it requires
  formatting and removing that field; new unformatted content is rejected.
- `rules`: explicitly listed naming/placement violations. Remove each when resolved.
- `maxLines`: the current physical count of an oversized file. It cannot increase; reduce
  or remove it when the file shrinks. Reformatting may require splitting a file first.

CI compares the baseline to the event's base commit; local checks default to `origin/master`.
Fetch first, or set `ALIGNMENT_BASE_REF` to the actual integration base. Missing history
fails closed. Bootstrap is limited to `efd6b8fcf5b8d6a9b048a5830c8c53cd1e14271b`, and each
initial exception must match a violation in that commit. There is no regeneration command.
Do not reset or widen the baseline to make checks pass. Remove resolved fields and empty
records, preserving `version` and `sourceCommit`. Stage 7 removes all legacy records.

Existing package/browser boundary checks remain active. Stage 2 will add resolved,
barrel-aware architecture enforcement, including workspace aliases, type-only imports,
cycles, unresolved imports and module/layer restrictions. These target rules are guidance
until that checker lands; stage 1 does not claim that architecture debt is resolved.
