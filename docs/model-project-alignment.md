# Model-project alignment

Tracking: [THE-27](https://linear.app/theoryfoundry/issue/THE-27).
Stage 3 merged in PR #14 at `05e0e24`. This is the first stage 4 slice.

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

Existing PostgreSQL and worker modules only follow the moved shared contracts/guards
and formatting. PostgreSQL row representations and timestamp conversion are extracted
so the touched persistence implementation also remains below 500 lines. Transaction,
query, ownership, quota, lease and replay logic is unchanged.

## Follow-on stage 4 work

THE-27 remains In Progress. PostgreSQL/worker composition and schema-cycle removal are
still required. Moving their public constructors revealed dependent runtime and HTTP
composition work currently assigned to stages 5–6. Migrate that wiring together in a
follow-on slice; do not retarget legacy exceptions or relabel business services as
composition to pass checks. Finish SQL adapter/domain separation and mirrored SQL/worker
tests before marking stage 4 complete. Node 24 remains stage 8.

## Verification

Run `pnpm verify`. The filesystem suite covers cross-process promotion, interruption at
publication failpoints, tampering, concurrent validation and recovery. Check a clean
model-project build for stale implementation files and for tests in output. Compare
package exports and preserved SQL against the merged base.

Run the opt-in `packages/runtime/src/worker/export-concurrency.integration.test.mjs`
against an empty disposable PostgreSQL database using
`THEORYFOUNDRY_TEST_EXPORT_DATABASE_URL`; it applies committed migrations and tests
admission, shared quota and completion/cancellation races. Never point it at an existing
database. Deployment and live acceptance remain separate from these checks.
