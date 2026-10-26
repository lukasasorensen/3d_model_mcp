# Engineering guidelines

These instructions apply throughout the workspace. Preserve `apps/site`, every
package identity, and the nested `packages/runtime/model-project` boundary.
See [alignment plan](docs/alignment-plan.md) for the staged migration and
[architecture conventions](docs/architecture-conventions.md) for dependency rules.

## Tracking and delivery

- Use connected Linear tools before substantial implementation: find and read the
  relevant issue, avoid duplicates, and confirm the team/project from current context.
  Reuse existing statuses and labels; do not invent deadlines or estimates.
- Keep statuses, dependencies, PR links, and verification evidence current. Fetch
  saved updates to verify them. Keep secrets and sensitive logs out of Linear.
  If tracking is unavailable, continue authorized local work and report pending updates.
- Use the existing `master` branch and short-lived `codex/<ISSUE-ID>-<slug>` branches
  (`codex/<slug>` if tracking is unavailable). Open focused PRs. Use `Fixes` only when
  merging completes the issue, `Contributes to` for partial work, and `Relates to` for context.
- Merge only when explicitly requested, after rechecking the PR head and required checks.
  Mark Done only when completion criteria are verified. Track implementation,
  deployment, and live acceptance separately; a passing build is not live acceptance.

## Architecture and TypeScript

- Group code by domain or feature inside each package. Within those modules use
  controllers, optional workflows, services, and narrowly named utilities. Do not
  create empty architectural scaffolding. Framework entry points stay conventional.
- Controllers validate input and call one service or workflow per operation.
  Workflows sequence services. Services never import other services, workflows, or
  controllers, even across modules, through barrels, or via type-only imports.
  Controllers never import controllers; workflows never import workflows.
- Utilities depend only on acyclic utilities and contracts. Types and ports never
  depend on implementations. Inject narrow infrastructure capabilities through
  domain-owned ports; do not disguise peer business services as ports.
- Features may use domain public APIs, subject to layering. Domains do not import
  features or concrete infrastructure. Infrastructure may use domain contracts,
  not domain services or orchestration. Shared foundations depend on none of these.
- Cross-module imports use public re-export-only `index.ts` APIs and remain acyclic.
  Internal files never import their own barrel. Explicit application composition
  constructs dependencies and owns resource lifetime; package barrels contain no logic.
- Prefer strict types, validated `unknown` input, explicit public contracts,
  discriminated unions, narrow interfaces and substitutable implementations.
  Choose cohesive functions or classes as appropriate. Use composition and explicit
  injection, avoiding speculative abstractions, global mutable state and unnecessary inheritance.
- Preserve operational errors and domain-specific failure modes. Close resources
  after failed startup and normal shutdown. Keep authorization at every persistence boundary.

## Naming, size and documentation

- Use kebab-case folders and camelCase stems with explicit roles, including inside
  layer folders: `services/readModel.service.ts`, `utils/shape.util.ts`.
  Preserve Next.js special filenames and route segments. See conventions for exemptions.
- Put new tests in each project's `tests/` tree, mirroring source paths and keeping
  the full implementation stem (`readModel.service.test.ts`). Root tooling tests
  live in `tests/tooling/`. Move existing tests with their owning migration stage.
- Keep one cohesive responsibility per file, at most 500 physical lines including
  comments, tests and documentation. Split by responsibility, not arbitrary line ranges.
  Lockfiles, generated output and immutable migration history are exempt.
- Keep comments succinct and focused on intent. Put lengthy explanations, plans,
  decisions, setup changes and verification evidence in focused files under `docs/`.
- Existing naming, placement, size and formatting debt is recorded in the shrinking
  legacy baseline. New files must comply. Never add or widen an exemption; remove
  resolved entries. Formatting is checked without rewriting source.

## Persistence and verification

- One table per `.schema.ts`, one enum per `.enum.ts`. Shared column/constraint
  factories create fresh Drizzle column instances for each table.
- Preserve SQL names, ownership isolation, transaction/lock semantics, token hashing,
  leases and idempotency during structural changes. Never persist reusable plaintext secrets.
  Commit migrations only for intentional schema changes; structural refactors produce none.
- Update imports, exports, build inputs, commands, tests and documentation together.
  Preserve public protocols, feature flags, artifact formats and renderer asset pins.
- Run focused checks while iterating, then `pnpm verify` before handoff. Use Node 22
  until the separately verified Node 24 stage. See [development workflow](docs/development-workflow.md).
