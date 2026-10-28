# Model-project alignment

Tracking: [THE-27](https://linear.app/theoryfoundry/issue/THE-27).
Stage 3 merged in PR #14 at `05e0e24`; the filesystem slice merged in PR #15 at
`440e85f`. This document records both stage 4 slices.

## Scope and boundaries

The filesystem repository now composes independent capabilities while retaining
`new ModelProjectRepository(options)` and its public methods. The package remains
`packages/runtime/model-project`; callers keep using its public entry point.

| Responsibility                                        | Location under `src/`                                |
| ----------------------------------------------------- | ---------------------------------------------------- |
| Public filesystem constructor and wiring              | `filesystemRepository.composition.ts`                |
| Project store, state and repository option contracts  | `domains/project/`                                   |
| Source, render, error and hash validation foundations | `shared/`                                            |
| Filesystem source proposal, promotion and restoration | `infrastructure/workflows/fileProject.workflow.ts`   |
| Directory locks and abandoned-owner recovery          | `infrastructure/services/fileLocks.service.ts`       |
| Candidate/revision records and reconciliation         | `infrastructure/services/fileRecords.service.ts`     |
| Durable revision and pointer publication              | `infrastructure/services/filePublication.service.ts` |
| Candidate rendering and attempt persistence           | `infrastructure/services/fileValidation.service.ts`  |
| Source, history, artifact and project queries         | `infrastructure/services/fileQueries.service.ts`     |
| Exclusive durable writes, rename and directory sync   | `infrastructure/services/durableFiles.service.ts`    |
| Pure path construction and JSON serialization         | `infrastructure/utils/fileLayout.util.ts`            |

The filesystem workflow belongs to infrastructure because it coordinates filesystem
layout and durability. Services consume explicit storage capabilities in
`infrastructure/filesystem.port.ts`; they never import sibling service implementations.
The composition entry constructs those capabilities. Renderer behavior remains injected
through the existing `CadRenderer` contract. Domain store contracts contain no concrete
filesystem or database imports.

The previous 796-line repository and its oversized test suite are split by responsibility.
Tests mirror the composition and service paths; shared child-process setup lives in
`tests/fixtures/fileProject.fixture.mjs`. Each new file is below 500 physical lines.

## Preserved behavior

- Source-byte limits, forbidden references, renderer provenance and artifact validation.
- Candidate transitions, attempt identity, cancellation and retry behavior.
- Exclusive lock acquisition, timeout, live-owner protection and abandoned-lock recovery.
- Promotion order: durable immutable artifacts, durable revision, version-directory sync,
  atomic `CURRENT`, then materialized source. Existing failpoint names/order are unchanged.
- Exact-parent compare-and-swap, restoration as a new revision and reopen reconciliation.
- Public export names, option defaults, on-disk paths, SQL strings and migration history.

## Verification

Run `pnpm verify`. The filesystem suite covers cross-process promotion, interruption at
publication failpoints, tampering, concurrent validation and recovery. Check a clean
model-project build for stale implementation files and for tests in output. Compare
package exports and preserved SQL against the merged base.

Run the opt-in `packages/runtime/tests/features/worker/exportConcurrency.integration.test.mjs`
against an empty disposable PostgreSQL database using
`THEORYFOUNDRY_TEST_EXPORT_DATABASE_URL`; it applies committed migrations and tests
admission, shared quota and completion/cancellation races. Never point it at an existing
database. Deployment and live acceptance remain separate from these checks.

## PostgreSQL and worker completion

The second slice starts from PR #15 (`440e85f`) and completes THE-27's remaining
PostgreSQL/worker boundaries. Root composition entries retain the existing public
constructors. `domains/project` owns persistence and notification contracts, source
reads, candidate validation and the project workflow. `domains/worker` owns validation
and export workflows plus their transaction contracts. Infrastructure implements SQL,
notification delivery, export reservation/receipts and transaction lifetimes.

Worker validation injects candidate persistence bound to the same `PoolClient` as its
owner lock. Export admission keeps its global advisory lock, evaluates the clock after
locking, recovers expired work, and isolates the operation with a savepoint. Expected
rejections preserve recovery; operational failures roll back and always release the
client. Tokens remain hashed, and ownership, quotas, replay and lease checks stay intact.

Schema factories receive deferred foreign-key callbacks. `database.schema.ts` assembles
all table instances without an import cycle; each table/enum retains its own file.
Self-references stay within the owning table. Fresh column factories and all SQL names,
foreign keys, indexes and migration files are preserved. `pnpm --filter
@theoryfoundry/model-project db:generate` must report no schema changes.

Runtime composition now constructs PostgreSQL, browser, worker, export, authentication
and MCP dependencies explicitly. Site export/preview handlers receive capabilities;
Next.js route entries select the configured handlers. Existing public runtime APIs and
executable paths stay stable. The remaining runtime feature and Next.js organization
belongs to THE-28/THE-29; this slice does not relabel their implementation as composition.

New mirrored worker tests check recovery, failure propagation and transaction cleanup;
schema tests evaluate every deferred foreign key. Existing runtime recovery tests are
split into CAD workflow and export composition suites, retaining all cases. Real
PostgreSQL concurrency remains a required separate check, since in-memory databases do
not prove advisory/row-lock behavior.

Verification for the completion slice: full `pnpm verify` passed from clean
model-project/runtime build output (260 passed, three existing optional skips).
The skipped PostgreSQL export-concurrency and stdio journeys also passed separately
against disposable PostgreSQL 18.6. The stdio fixture now announces browser readiness
before requesting validation, matching the production readiness gate. Public value
exports remain 49 in model-project and 50 in runtime; all 79 model-project SQL statements
match the merged base after formatting normalization. Drizzle generates no migration.
Architecture records shrink from 309 to 167, with zero remaining for THE-27;
convention records shrink from 223 to 153. Retained architecture records are unchanged.
