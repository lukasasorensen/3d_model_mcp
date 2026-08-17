# Security model

LLM-authored OpenSCAD is untrusted executable input. The agent cannot choose a
runtime, image, executable, flag, path, mount, environment variable, network mode,
or output format. Tool IDs are opaque and strict schemas reject paths. Source is
limited to 256 KiB; only `BOSL2/...` include/use references are allowed; import and
surface file references are rejected.

The production OCI controller fails closed unless effective state proves a pinned
image, rootless or VM-backed execution, non-root UID, network `none`, read-only root
and input, distinct empty output, dropped capabilities, no-new-privileges, seccomp,
512 MiB RAM, one CPU, 128 PIDs, and bounded process cleanup. Jobs warn at 30 seconds
and are killed at 60 seconds. stdout/stderr are capped at 1 MiB each. Preview limits
are 10 MiB and 250,000 triangles; 3MF is limited to 25 MiB.

Independent parsers and repository hashes defend against malformed, truncated, or
substituted artifacts. Per-project locking and in-lock parent CAS defend against
stale promotion. Cancellation propagates across browser, LangChain, MCP, repository,
and renderer boundaries without advancing current state.

Observability uses a versioned bounded schema. Prompts, source, credentials, tokens,
host paths, raw environments, and container commands are not fields and seeded
canaries are redacted. Metadata has bounded key/value cardinality; metric labels are
only service, operation, outcome, and diagnostic code—never IDs. Each request is
capped at 1,000 records and 1 MiB with one truncation marker.

This repository makes no claim of kernel/runtime escape freedom. The deterministic
test renderer is not isolation evidence. No public deployment is approved; CP-5
would require authentication, abuse controls, rate limits, retention, and hosted
isolation review.
