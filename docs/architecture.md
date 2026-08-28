# Architecture

The authenticated combined runtime preserves one directional trust path:

```text
Next.js/React UI -> v3 NDJSON gateway -> LangChain createAgent
  -> official MCP SDK client -> narrow MCP CAD server
  -> owner-scoped PostgreSQL repository -> database-backed browser render coordinator
```

The default standalone MCP transport is stdio. `connectCadMcpStdio` keeps protocol
frames on stdout, while operator diagnostics use stderr. The combined app may use
the official SDK's linked in-memory transport without bypassing MCP negotiation or
tool schemas. Browser code imports only `@rjls/contracts`; package-boundary checks
reject Node, provider, MCP-server, repository, and renderer imports.

For local Codex testing, the standalone MCP process and Next.js process share a
`DATABASE_URL`; the trusted stdio process is explicitly bound with `RJLS_ACTOR_USER_ID`.
A development-only filesystem bridge stores bounded,
source-bound render jobs outside individual projects. The open browser atomically
claims one job through same-origin HTTP, renders with the same pinned Web Worker,
and posts a session/token/hash-bound completion. The stdio process consumes the
completion and deletes the job. Expiration, cancellation, duplicate completion,
or process loss cannot advance candidate or revision state. The bridge requires
`RJLS_LOCAL_MCP_BRIDGE=1` and is unavailable when `NODE_ENV=production`.

`projects.current_revision_id` and its immutable revision row are authoritative. A candidate
must move through `CREATED -> RUNNING -> VALID -> PROMOTED`. Promotion rechecks the
parent while holding a PostgreSQL row lock and advances current in the same transaction
that publishes source and manifest metadata. Rejected, cancelled, malformed,
oversized, or stale candidates never replace the last-known-valid revision. Restore
publishes a new child revision with `restoredFrom`; it never rewinds history.

Better Auth cookie sessions provide identity at the HTTP boundary. Repository and MCP
instances are scoped to the server-derived user ID; project IDs and browser session IDs
never grant authority. Hosted render completions are persisted as token-hash, user,
project, candidate, session, source-hash, and deadline-bound jobs so any app instance can
accept a completion without weakening one-time validation.

OpenSCAD source is the canonical model. The browser compiles the exact source hash to
an ephemeral STL preview or 3MF download using pinned OpenSCAD WASM and BOSL2 assets.
Mesh bytes are never uploaded or stored by the server.

## Profiles

- `mock` provider: credential-free deterministic LangChain model. It still uses the
  real agent, MCP protocol, repository, and configured renderer.
- `browser-wasm` renderer: the active promotable profile. It binds validation to the
  exact source hash and pinned OpenSCAD/BOSL2 manifest without claiming server attestation.
- Test-only renderer fixture: emits independently parseable deterministic binary
  STL and 3MF for integration tests. Its name and tessellation metadata say
  `test-only`; it proves cross-layer contracts, not browser OpenSCAD execution.

HTTP MCP, sharing/collaboration, arbitrary mesh upload/editing, generic
shell/file tools, live-provider selection, and engineering/manufacturing approval
are outside this MVP.
