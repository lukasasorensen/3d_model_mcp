# Security model

LLM-authored OpenSCAD is untrusted input. The agent cannot choose the WASM module,
backend, library bundle, command flags, virtual paths, or output format. Tool IDs are opaque and strict schemas reject paths. Source is
limited to 256 KiB; only `BOSL2/...` include/use references are allowed; import and
surface file references are rejected.

Each job uses a fresh Web Worker and in-memory Emscripten filesystem. The worker is
terminated on completion, cancellation, or the 60-second deadline. Preview limits
are 10 MiB and 250,000 triangles; 3MF is limited to 25 MiB. One-time completion
tokens bind browser results to the session, candidate, source hash, renderer pins,
owner, project, and deadline, and cannot be replayed. PostgreSQL stores only the
token hash and bounded completion metadata.

Browser parsers and source hashes defend against malformed or substituted responses.
PostgreSQL row locks, conditional state updates, and transactional parent CAS defend
against stale promotion. Better Auth cookie sessions scope every HTTP repository and
MCP instance to a server-derived owner; unauthorized and missing projects are both
reported as not found. Cancellation propagates across browser, LangChain, MCP, repository,
and renderer boundaries without advancing current state.

Observability uses a versioned bounded schema. Prompts, source, credentials, tokens,
host paths, raw environments, and container commands are not fields and seeded
canaries are redacted. Metadata has bounded key/value cardinality; metric labels are
only service, operation, outcome, and diagnostic code—never IDs. Each request is
capped at 1,000 records and 1 MiB with one truncation marker.

Browser validation is client-attested and is not server proof of geometry correctness.
The deterministic test renderer is not browser execution evidence. Enrollment is
invite-only; public registration, email recovery, sharing, and object storage remain
outside the approved boundary.
