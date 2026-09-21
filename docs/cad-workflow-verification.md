# Recoverable CAD workflow verification

Verified on 2026-09-21 using an isolated PostgreSQL 17 database, the local application,
the stdio MCP SDK client, and a signed-in browser running the pinned OpenSCAD WASM.
No production deployment or production database changes were made.

## Browser acceptance

The project began with no project tab open. Validation returned `BROWSER_REQUIRED`
and the configured project URL. Opening that URL allowed the same candidate to
validate. The database contained exactly one candidate for the project.

The client retrieved a PNG preview before promotion. The preview was also visually
inspected and showed the expected rectangular solid. Promotion retained geometry
of 20 × 30 × 10 mm with 12 triangles and the renderer provenance.

Both exports were fetched directly from receipt URLs. Each downloaded file was
parsed independently and had bounds `[0,0,0]` to `[20,30,10]`, with 12 triangles.
SHA-256 and byte counts matched the server receipts:

| Format | Bytes | SHA-256 |
| --- | ---: | --- |
| STL | 684 | `217d39d836f973db67e6530d239e4d01bdfd4f31e8feb7afc4fc18ccb358b395` |
| 3MF | 1719 | `baa133762479e89f093b75a2efcaafd9e072ebb695c0e961cf63c87b9991261f` |

Repeating exports reused the export IDs and files while issuing fresh links.
Bearer URLs and completion tokens are intentionally excluded from this record.
The OpenSCAD 3MF output uses ZIP64; a separate committed fixture covers its parser.

Run `packages/runtime/src/fixtures/workflow-acceptance.mjs create` against an
isolated configured environment, open the returned project URL, then run `finish`.
The fixture uses the built stdio server and asserts the complete sequence. The
`export` mode verifies reuse and independently parses downloaded geometry.

## Automated coverage

The regression suite exercises closed, hidden and busy browsers, retryable failure,
cancellation, terminal source rejection, concurrent attempts, deadline recovery,
late completion fencing, ownership, token replay and expiry, source binding,
malformed and oversized bytes, owner/global quota reservations, revision pinning,
file reuse, expired-file deletion and orphan reconciliation.

The HTTP MCP integration test exercises tool schemas, browser recovery errors and
receipt reuse through the remote transport. Real browser rendering and downloads
were exercised through stdio; production OAuth and tunnel deployment are outside
this acceptance run.

Use `pnpm verify` for lint, types, unit/integration tests, production build, package
boundaries and template identity checks. Apply additive migration
`0009_clever_spot.sql` before the coordinated application/MCP rollout. Configure a
private writable export directory (the deployment repository provides a volume),
then restart MCP clients to refresh schemas.
