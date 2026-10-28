# Hosted local-worker exports

THE-22 adds hosted STL/3MF export leases for THE-15. A worker renders locally and
uploads bytes; the hosted service owns revision identity, capacity, artifact
validation, metadata, and download receipts. CLI packaging and npm publication
remain separate work.

## Access and rollout

Apply migration `0012_worker-export-jobs.sql` with the normal migration runner
before running this version. Both `THEORYFOUNDRY_REMOTE_MCP_ENABLED=1` and
`THEORYFOUNDRY_LOCAL_WORKER_ENABLED=1` are required. Every operation uses the
existing OAuth CAD resource (`<origin>/mcp`), `cad:tools` scope and current grant
checks described in [worker validation](local-worker-validation.md). Cookies
alone do not authorize workers. Native clients may omit Origin; a supplied
Origin must equal the configured public origin. Responses use `no-store`.

## Protocol version 1

All operations are POSTs under `/v1/worker/exports/`.

`begin` accepts JSON:

```json
{
  "version": "1",
  "projectId": "project-id",
  "revisionId": "revision-id",
  "format": "stl",
  "previewProfile": "standard"
}
```

`format` is `stl` or `3mf`. Admission requires the current owned revision and
verifies its stored source/hash. A new response contains `state: "PENDING"`,
`projectId`, `revisionId`, `format`, `source`, `sourceHash`, `jobId`, `exportId`,
`token`, `deadline`, expected `renderer` provenance, and
`executionOrigin: "local-worker"`. Keep the capability private.

An unexpired ready artifact can instead return
`{version:"1",state:"COMPLETED",reused:true,metadata,receipt}`. Pending browser
and worker reservations are separate. An already pending worker export returns
retryable `WORKER_CAPACITY`; it does not replace the capability. A lost begin
response must wait for lease expiry before retrying.

`status` and `cancel` accept the exact capability binding as JSON:

```json
{
  "version": "1",
  "projectId": "project-id",
  "revisionId": "revision-id",
  "format": "stl",
  "jobId": "job-id",
  "exportId": "export-id",
  "sourceHash": "64-lowercase-hex",
  "token": "64-lowercase-hex"
}
```

`complete` accepts multipart/form-data with exactly these fields:

- `metadata`: a JSON **text** field containing that capability binding plus
  `outcome: "COMPLETED"` and `provenance` matching the supported renderer/policy.
- `artifact`: one binary file containing STL or 3MF bytes. Its filename is ignored.

For renderer failure, send `outcome: "FAILED"` with provenance and omit artifact.
Do not send base64, additional fields, or duplicate fields. Authentication occurs
before reading the upload. Metadata is limited to 128 KiB, the entire wire body
to 25 MiB + 256 KiB, and reads to 30 seconds. Control JSON is limited to 128 KiB
and ten seconds. Abort/error paths release the body reader.

Status/completion/cancel responses contain the bound identity, deadline, state,
`executionOrigin`, and `artifactAvailable`. Terminal states are `COMPLETED`,
`CANCELLED`, `FAILED`, and `EXPIRED`. Completed jobs retain immutable `metadata`;
`receipt` appears only while the artifact is available. Fetch `receipt.downloadUrl`
to download it. The receipt is a bearer credential and must remain private.

## Lifetime and correctness

Leases last 120 seconds, with at most two pending worker exports per owner,
independent of validation jobs. STL is limited to 10 MiB and 3MF to 25 MiB.
Browser and worker exports share the 250 MiB owner / 2 GiB global temporary
capacity budget. Pending jobs reserve the format maximum; successful completion
replaces that reservation with actual byte size. Cancel, failure, and expiry
release capacity. Artifacts last one hour after completion; receipts last at
most ten minutes and never outlive the artifact.

Completion rechecks the owner, binding and active lease inside the transaction.
A revision promoted after admission does not invalidate the pinned job. The
server parses the artifact and computes its byte hash, filename, and metadata.
Declared source/provenance binds inputs but is not proof that an untrusted worker
rendered that source.

Identical retries preserve metadata without rewriting files or counting quota
again. Receipt URLs can change. Conflicting completions fail. Cancel and expiry
fence late uploads, and concurrent terminal operations settle on one outcome.
Terminal jobs remain for one hour after termination (expiry uses the deadline),
independently of artifact deletion; after retention their capability is unavailable.
Only hashes of capabilities and download tokens are persisted.

File writes are atomic. Database rollback leaves a retryable reservation; an
uncertain commit never triggers deletion of potentially committed bytes. Periodic
cleanup reconciles expired reservations, receipts, terminal jobs, and orphan files.
Operational failures return 503, capacity 429, invalid input 400, oversized input
413, read timeout 408, and binding/state conflicts 409.

## Verification

`pnpm verify` includes PGlite lifecycle, multipart, fault-injection and existing
browser export regressions. The real PostgreSQL concurrency test is opt-in:

```sh
THEORYFOUNDRY_TEST_EXPORT_DATABASE_URL=postgresql://... \
  node --test packages/runtime/tests/features/worker/exportConcurrency.integration.test.mjs
```

Use an **empty disposable database**: this test applies every committed migration.
It exercises simultaneous owner-capacity and shared browser/worker quota admission,
duplicate completion, and completion/cancel races with separate connections.
Production migration, flag enablement, and live client acceptance are separate.
