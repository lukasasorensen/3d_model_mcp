# Hosted local-worker validation API

This is the first API slice of THE-15, tracked by THE-18. It supports validation
leases only. Project CRUD and promotion remain existing hosted MCP tools. Export
jobs, client registration/login, and the distributed stdio worker are subsequent
work. [Preview source delivery](local-worker-preview-source.md) is implemented
separately under THE-19.

## Enablement and authentication

Apply committed migration `0011_worker-validation-jobs.sql` through the normal
database migration command before enabling these endpoints. This work does not
apply migrations to a deployed database. Both server flags must be enabled:

```dotenv
THEORYFOUNDRY_REMOTE_MCP_ENABLED=1
THEORYFOUNDRY_LOCAL_WORKER_ENABLED=1
```

The worker flag defaults to zero. All operations are POST requests under
`/v1/worker/validation/`. They require a valid OAuth bearer token for the existing
CAD resource (`<origin>/mcp`), including its `cad:tools` scope and current grant.
These routes extend that protected CAD resource; they do not accept session
cookies or tokens intended for another resource. Provisioning a dedicated local
worker OAuth client and local credential storage remain the next auth milestone.

Native callers may omit Origin; a supplied Origin must match the configured CAD
origin. Responses use `Cache-Control: no-store`. Capabilities belong in request
bodies, never query strings. JSON is bounded to 128 KiB, including streamed bodies,
with a ten-second read deadline. Authentication and storage outages remain 503
errors rather than being reported as missing projects.

## Protocol version 1

| Endpoint | Request | Result |
| --- | --- | --- |
| `begin` | `version: "1"`, projectId, candidateId, `previewProfile: "standard"` | Lease with immutable source/hash, attempt/job IDs, capability token, policy version, deadline |
| `status` | projectId, candidateId, jobId, token | PENDING, COMPLETED, CANCELLED, or EXPIRED |
| `complete` | Same binding plus sourceHash and result | Saved candidate snapshot and terminal status |
| `cancel` | Same binding as status | Idempotent terminal status; pending candidate becomes retryable |

A completion result contains outcome (`VALID`, `REJECTED`, or `FAILED`), bounded
diagnostics, renderer provenance, and geometry when VALID. It does not accept a
candidate state, owner identity, source replacement, or promotion instruction.
Only the shared server-side validation service determines candidate transitions.

The server accepts the current pinned WASM/glue/BOSL2 renderer and command-policy
metadata. Incompatible source or renderer bindings are rejected without changing
the pending candidate. Declared hashes are compatibility/integrity information,
not proof that untrusted client software actually executed OpenSCAD. Geometry is
client-reported, matching the existing browser validation trust model. Worker
execution origin is recorded separately in `worker_validation_jobs` and responses
identify it as `local-worker`.

## Lifecycle and concurrency

- A lease lasts 120 seconds. At most two pending worker jobs are admitted per
  authenticated owner. Admission and job operations lock the owner's row so the
  limit applies across server replicas.
- Browser and local worker attempts use the same candidate claim/completion
  service. A RUNNING candidate cannot be claimed by another execution path.
- Capability tokens are random 256-bit values; only SHA-256 verifiers are stored.
  Each operation also checks authenticated ownership and exact project/candidate
  binding. A job ID or token alone grants no access.
- A successful completion stores the candidate transition and immutable response
  snapshot in one transaction. Exact retries return that snapshot, even if the
  candidate was subsequently promoted. Conflicting completion retries fail.
- Operational failure, cancellation, and expiry restore CREATED so the same
  candidate can be retried. Model rejection remains REJECTED. Expired attempts
  are recovered when an owner makes another worker request; the existing browser
  recovery path can also recover interrupted validation attempts.
- Attempt IDs fence every completion. Late results cannot change a newer attempt.
  Terminal status/replay reads still require OAuth and the capability; only
  PENDING jobs can change candidate state before their deadline.
- A lost begin response cannot recover the raw capability from its verifier.
  Inspect project state and retry the same candidate after lease expiry rather
  than creating a replacement candidate.

Existing exact-parent promotion checks remain authoritative. This API never
promotes a candidate automatically and never requires a visible project tab.

## Verification

Focused checks:

```bash
pnpm build:packages
node --test packages/runtime/src/worker/*.test.mjs
```

Integration fixtures use the real PostgreSQL engine through PGlite and apply all
committed migrations. They cover ownership/capability/hash/provenance binding,
capacity, cancellation, expiry, concurrent callers, duplicate/conflicting
completion, promotion after completion, and transaction rollback. PGlite models a
single-connection pool; this does not claim live multi-replica acceptance.
HTTP checks cover disabled routes, foreign origins, cookie-only rejection,
strict payloads, bounded streaming, and operational error status codes.

Run `pnpm verify` for the complete existing browser/MCP regression suite. Public
worker client and deployed end-to-end acceptance remain separate milestones.

STL/3MF leases and binary completion are documented in
[worker exports](local-worker-exports.md).
