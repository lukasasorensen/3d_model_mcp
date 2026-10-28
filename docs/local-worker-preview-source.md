# Hosted local-worker preview source API

THE-19 adds source delivery for local PNG rendering under THE-15. This endpoint
only reads canonical source. It does not render, require browser presence,
enqueue jobs, change candidates, or upload/store PNGs.

## Access

`POST /v1/worker/preview/source` requires both
`THEORYFOUNDRY_REMOTE_MCP_ENABLED=1` and `THEORYFOUNDRY_LOCAL_WORKER_ENABLED=1`.
It uses the same OAuth-protected CAD resource (`<origin>/mcp`), `cad:tools` scope,
and current-grant verification as [worker validation](local-worker-validation.md).
Browser cookies alone are insufficient. Native clients can omit Origin; a
supplied Origin must match the configured origin. Every response is non-cacheable.

JSON requests are limited to 128 KiB, including streamed bodies, with a ten-second
read deadline. Source is limited separately to 256 KiB of UTF-8 bytes. No new
database migration is needed; the existing committed schema must be applied.
Dedicated worker OAuth registration, credentials, CLI packaging, and production
enablement remain separate work under THE-15.

## Protocol version 1

```json
{ "version": "1", "projectId": "project-id" }
```

Omit both selectors to resolve the current revision. Supply `revisionId` for a
specific saved revision, or `candidateId` for a candidate whose state is exactly
`VALID` at retrieval. Supplying both selectors, unknown fields, unsupported
versions, or invalid IDs fails. A promoted candidate must be addressed through
its saved revision. Projects without a current revision return `PROJECT_NOT_FOUND`.

The response contains `version`, `projectId`, exactly one concrete `revisionId`
or `candidateId`, `source`, `sourceHash` (lowercase SHA-256 of UTF-8 source), and
`renderer` (the existing pinned OpenSCAD WASM/glue/BOSL2, Manifold backend, renderer,
command policy, and validation policy metadata).

The server checks ownership and source integrity before returning bytes. A
current-revision response names the revision resolved for that request; later
promotion does not change its source. A subsequent request without a selector
can resolve a newer revision. The local worker must verify the source hash and
renderer compatibility before rendering. Renderer metadata describes expected
compatibility, not attestation that rendering occurred. Source delivery does not
authorize promotion or exports; those operations independently recheck access.

No view parameter is needed: one source target supports all local camera views.
The eventual worker renders PNGs locally and returns MCP image content directly.

## Failures and verification

- Disabled endpoints: 404; missing/invalid/revoked OAuth: 401; insufficient scope
  or foreign Origin: 403.
- Invalid JSON/schema: 400; oversized request: 413; aborted/timed-out body: 408.
- Missing or foreign-owned projects/targets: 404; invalid candidate state or
  source integrity/size conflicts: 409.
- Authentication storage failures: 503 `AUTHENTICATION_UNAVAILABLE`; other
  operational failures: 503 `WORKER_PREVIEW_SOURCE_UNAVAILABLE`.

Focused verification after building packages:

```bash
pnpm build:packages
pnpm --filter @theoryfoundry/runtime test
pnpm --filter @theoryfoundry/model-project db:generate
```

Tests exercise PostgreSQL-backed source selection and owner/project isolation,
historical revision stability, candidate states, corruption, UTF-8 limits, no-job
behavior, OAuth audience/scope/revocation, bounded requests, and error handling.
Run `pnpm verify` for the browser/MCP regressions and production build. These
checks do not establish deployed worker enablement or live Codex/Claude acceptance.
