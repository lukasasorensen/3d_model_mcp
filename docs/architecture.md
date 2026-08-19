# Architecture

The local combined runtime preserves one directional trust path:

```text
Next.js/React UI -> v3 NDJSON gateway -> LangChain createAgent
  -> official MCP SDK client -> narrow MCP CAD server
  -> immutable model repository -> browser render coordinator
```

The default standalone MCP transport is stdio. `connectCadMcpStdio` keeps protocol
frames on stdout, while operator diagnostics use stderr. The combined app may use
the official SDK's linked in-memory transport without bypassing MCP negotiation or
tool schemas. Browser code imports only `@rjls/contracts`; package-boundary checks
reject Node, provider, MCP-server, repository, and renderer imports.

For local Codex testing, the standalone MCP process and Next.js process share an
absolute `RJLS_PROJECTS_ROOT`. A development-only filesystem bridge stores bounded,
source-bound render jobs outside individual projects. The open browser atomically
claims one job through same-origin HTTP, renders with the same pinned Web Worker,
and posts a session/token/hash-bound completion. The stdio process consumes the
completion and deletes the job. Expiration, cancellation, duplicate completion,
or process loss cannot advance candidate or revision state. The bridge requires
`RJLS_LOCAL_MCP_BRIDGE=1` and is unavailable when `NODE_ENV=production`.

`.rjls/CURRENT` and its immutable revision manifest are authoritative. A candidate
must move through `CREATED -> RUNNING -> VALID -> PROMOTED`. Promotion rechecks the
parent under a project lock and advances `CURRENT` only after durable source,
manifest, and a matching browser-validation receipt exist. Rejected, cancelled, malformed,
oversized, or stale candidates never replace the last-known-valid revision. Restore
publishes a new child revision with `restoredFrom`; it never rewinds history.

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

HTTP MCP, hosted deployment, collaboration, arbitrary mesh upload/editing, generic
shell/file tools, live-provider selection, and engineering/manufacturing approval
are outside this MVP.
