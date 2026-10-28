# Runtime feature alignment

[THE-28](https://linear.app/theoryfoundry/issue/THE-28) follows the gateway/MCP
slice merged in PR #17 (`77ac9c0`). This continuation organizes the remaining
runtime modules while preserving package identities and deployment boundaries.

## Ownership and composition

| Area                         | Responsibility                                                                                                                   |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `features/authentication`    | OAuth grants/provisioning, redirect diagnostics, protected-resource metadata and remote token verification                       |
| `features/browser-rendering` | In-memory rendering, persisted rendering workflows, atomic claim capabilities, notification/deadline waits and provenance checks |
| `features/model-preview`     | Preview orchestration, PNG validation and completion validation                                                                  |
| `features/model-export`      | Export orchestration, artifact finalization, directory file storage and owned export contracts                                   |
| `features/worker`            | Thin export/validation/preview controllers, shared admission workflow, bounded upload readers and preview-source service         |
| `features/cad-session`       | CAD orchestration, leased runtime lifetime, readiness and public runtime contracts                                               |
| `features/observability`     | Bounded evidence sinks, retained request evidence, redaction and remote MCP event recording                                      |
| `features/mcp`               | Connected-client protocol adaptation and remote HTTP admission/lifecycle                                                         |
| `shared`                     | Stable runtime constant, domain-error guard, MCP policy and authentication challenge formatting                                  |

Root `*.composition.ts` modules construct adapters, connect services and supply
runtime configuration. Existing public constructors and factories retain their
signatures. The root index contains only re-exports. Cross-feature dependencies
use feature indexes; internal files import lower-level modules directly.

Runtime, browser-renderer and observability contracts no longer import concrete
implementations. Browser claims receive a narrow event callback, so the claim
service does not import a peer logging service. Local/remote composition supplies
the existing event recorder. Preview composition supplies its origin resolver,
preserving when configuration is read.

## Compatibility boundaries

- Stage 5 retained the old compiled operator filenames temporarily. Stage 7 replaces
  them with `stdioServer.composition.js`, `provisionUser.composition.js` and
  `provisionOAuthClient.composition.js`; public `pnpm mcp:serve`, `auth:provision`
  and `oauth:provision` commands remain stable. No compatibility aliases remain.
- Preserve all 64 public runtime exports (50 values and 14 types), including the
  forwarded domain error and error-code exports.
- Preserve SQL text, transactions, ownership filters, token hashing, grant binding,
  renderer pins, cancellation, notification wakeups and cleanup ordering.
- Keep HTTP/MCP schemas, status/error mapping, stdout discipline, feature flags,
  dependency versions and deployment configuration unchanged.
- Authentication still verifies current grants; operational failures remain
  distinct from rejected credentials. Worker admission retains origin, capability,
  body-size and owner checks.

## Tests and fixture locations

All remaining runtime source-tree tests and fixtures move under `tests/`.
Feature suites mirror their source modules. Existing compiled-JavaScript tests
remain `.mjs`; no tests or fixtures belong in emitted library output.

The canonical journey separates into complete-journey, hostile-candidate,
observability and opt-in performance suites. Geometry generation, artifact
encoding, mesh assertions and renderer fixtures have focused owners. Preserve the
opt-in performance case and its skip state when editing test discovery.

Operator verification fixtures now live at:

- `packages/runtime/tests/fixtures/workflowAcceptance.fixture.mjs`
- `packages/runtime/tests/fixtures/browserPreviewSmoke.fixture.mjs`

The PostgreSQL concurrency gate is
`packages/runtime/tests/features/worker/exportConcurrency.integration.test.mjs`.
It requires an empty disposable database and applies the committed migrations.
The stdio journey remains `packages/runtime/tests/stdioServer.integration.test.mjs`.

## Completion gates

Compare public export names, all runtime SQL statements and the relocated test
inventory with the merged base. Run focused runtime tests, full Node 22
`pnpm verify`, disposable PostgreSQL concurrency and the compiled stdio journey.
Verify a clean runtime build emits no tests, fixtures or removed legacy modules.
Record exact-head CI in the PR and fetch saved Linear evidence.

This continuation removes all 64 remaining THE-28 architecture records. Total
architecture records decrease from 144 to 76 (all THE-29); convention records
shrink from 143 to 85. No records are added, widened or retargeted. The three
runtime convention records are the preserved operator filenames above.

## Verification evidence

Local Node 22 `pnpm verify` passed: 266 tests passed across 82 files and nine
projects, with three existing optional skips. The PostgreSQL concurrency and
compiled stdio cases then passed separately against disposable PostgreSQL 18.6.
The opt-in 20-run performance benchmark remains skipped.

Comparison with `77ac9c0` preserved 64 public exports, 35 SQL statements and all
50 relocated test cases, including the explicit performance skip. Clean runtime
output contains no tests, fixtures or removed legacy modules. The new claim tests
cover hashed-token binding, successful event recording and failure propagation.

Stage 5 completion still requires review and an explicitly authorized merge.
Stage 6 addresses the Next.js features; stage 7 removes the remaining convention
debt; Node 24 remains stage 8. Deployment and live acceptance remain separate.
