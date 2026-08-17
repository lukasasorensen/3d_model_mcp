# Architecture

The local combined runtime preserves one directional trust path:

```text
Next.js/React UI -> v3 NDJSON gateway -> LangChain createAgent
  -> official MCP SDK client -> narrow MCP CAD server
  -> immutable model repository -> isolated renderer controller
```

The default standalone MCP transport is stdio. `connectCadMcpStdio` keeps protocol
frames on stdout, while operator diagnostics use stderr. The combined app may use
the official SDK's linked in-memory transport without bypassing MCP negotiation or
tool schemas. Browser code imports only `@rjls/contracts`; package-boundary checks
reject Node, provider, MCP-server, repository, and renderer imports.

`.rjls/CURRENT` and its immutable revision manifest are authoritative. A candidate
must move through `CREATED -> RUNNING -> VALID -> PROMOTED`. Promotion rechecks the
parent under a project lock and advances `CURRENT` only after durable source,
manifest, and content-addressed artifacts exist. Rejected, cancelled, malformed,
oversized, or stale candidates never replace the last-known-valid revision. Restore
publishes a new child revision with `restoredFrom`; it never rewinds history.

OpenSCAD source is the canonical model. Binary STL is a validated inspection
artifact; 3MF is the fabrication export. Both bind MIME, bytes, triangles, bounds,
millimeter units, right-handed Z-up axes, source revision/hash, tessellation, and
renderer provenance. The browser reducer advances current state only from typed
revision events and enables preview/export only after manifest linkage is hydrated.

## Profiles

- `mock` provider: credential-free deterministic LangChain model. It still uses the
  real agent, MCP protocol, repository, and configured renderer.
- `production-oci` renderer: the only promotable runtime profile. It requires an
  exact OCI image digest, exact BOSL2 digest, and effective isolation attestation.
- Test-only renderer fixture: emits independently parseable deterministic binary
  STL and 3MF for integration tests. Its name and tessellation metadata say
  `test-only`; it proves cross-layer contracts, not OCI or OpenSCAD execution.
- `trusted-local-development`: host OpenSCAD without isolation. The repository
  refuses to promote this provenance.

HTTP MCP, hosted deployment, collaboration, arbitrary mesh upload/editing, generic
shell/file tools, live-provider selection, and engineering/manufacturing approval
are outside this MVP.
