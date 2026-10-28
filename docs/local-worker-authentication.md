# Local worker authentication

THE-15's authentication slice adds the private `@theoryfoundry/worker-auth`
workspace package. It has no database, MCP transport, renderer or published CLI.
The existing runtime, MCP package identity and browser-backed mode remain intact.
Local stdio integration and versioned distribution follow separately.

## Operator provisioning

After deploying this code through a separately authorized rollout, run the existing
operator command against the intended environment:

```sh
pnpm oauth:provision -- --worker
```

This transaction provisions `theoryfoundry-local-worker` as a public native client:
no client secret, authorization-code and rotating refresh grants, required S256
PKCE, explicit consent, and the exact callback
`http://127.0.0.1:43827/oauth/callback`. Repeating it restores the restricted
callback/scopes/resource mapping without re-enabling a disabled client. It does
not change the Codex client or require a schema migration. Provisioning has not
been run against production as part of this implementation.

The worker deliberately requests `cad:tools offline_access` for `<origin>/mcp`.
Hosted worker APIs already authenticate that audience, and the future local worker
will forward ordinary project tools to hosted MCP. Tokens for unrelated resources
are rejected. The issuer remains `<origin>/api/auth`. The provider ordinarily
allows native loopback port variance; a worker-specific hook enforces the exact
registered callback, including during consent and token exchange.

## Development use

Use Node 24.21.0 and build the workspace first:

```sh
pnpm build:packages
pnpm worker:auth login https://your-server.example
pnpm worker:auth logout https://your-server.example <account-id>
```

Login opens the system browser and prints only the authenticated account ID to
stderr. Use that ID for logout and the programmatic `accessToken(account)` method.
HTTP is accepted only for loopback origins with explicit `--allow-loopback-http`.
Origins must be canonical: no credentials, path, trailing slash, query or fragment.
No token may be passed as a command-line argument. These repository commands are
an authentication harness, not the installable `pnpm dlx` product.

`createWorkerAuthentication(origin)` exposes login, access-token acquisition and
logout for the future worker. It never prompts during access-token acquisition.
PKCE verifiers, state, authorization codes and access tokens remain in memory.
The callback listener binds only IPv4 loopback, validates state and issuer, rejects
duplicate parameters and replay, and closes on success, denial, cancellation or
failure. Callback pages contain no credentials or external assets. Authorization
waits are bounded to three minutes; HTTP requests to token/JWKS/revocation endpoints
have 15-second deadlines, reject redirects and bound parsed response bytes.
JWT signatures, issuer, audience, client, subject, expiry, scope and grant claims
are verified before any credential is stored.

## Credential storage and coordination

Refresh credentials use `@napi-rs/keyring` 2.1.2: macOS Keychain, Windows credential
storage, or Linux Secret Service. Linux explicitly requires Secret Service instead
of silently falling back to a session kernel keyring. A locked, absent or ambiguous
store fails with an actionable error; there is no plaintext fallback. A single OS
entry stores the refresh token with origin, account, format and generation metadata.
The entry key hashes the canonical origin and account. Rotation replaces that entry
with one store operation before releasing the lock. Native/HTTP error bodies are
not surfaced in user diagnostics.

All processes use `~/.theoryfoundry-worker-locks/<sha256-origin>.lock`. This private
local directory contains no tokens. An atomic directory claim serializes login,
refresh and logout for the origin; account-specific entries remain separate. Every
access-token acquisition re-reads the credential under the lock, so another
process's rotation or logout invalidates a stale in-memory cache. The wait for a
busy lock is bounded to 30 seconds and supports cancellation.

Locks never expire automatically: a suspended process must not race another
process using a single-use refresh token. After a crash, stop **all** workers and
login processes for the origin, remove only its empty lock directory, then log in
again. Never remove a live lock. An interrupted refresh can have succeeded remotely
without saving its replacement; reauthorization is the recovery path. Roaming or
network-mounted home directories and OS store synchronization across hosts have
not been accepted for concurrent use.

## Logout and revocation

Logout revokes the current refresh token upstream before removing its OS entry.
If the network fails, it keeps the entry so logout can be retried and reports
`REVOCATION_FAILED`. Repeated logout after successful removal is harmless.
An invalid refresh grant removes the obsolete local credential and requests login.
A failure to save a newly rotated token attempts to revoke it and never returns
that access token; unlock the store and log in again.

Already issued JWT access tokens can remain server-valid for their five-minute
lifetime after OAuth token revocation. Local clients observe the deleted credential
before their next token acquisition. To immediately invalidate the entire worker
grant, revoke **TheoryFoundry Local Worker** in Connected Apps. Hosted MCP/worker
requests check the current consent ID, so re-consent cannot revive an old grant.
Codex's separate client grant is unaffected.

## Verification and release boundary

Focused tests exercise the real Better Auth provider with disposable PGlite for
both Codex and worker login/consent/PKCE, resource binding, hashed server storage,
refresh rotation, token revocation and Connected Apps revocation. Local tests
cover signed/forged token responses, account/origin separation, redacted errors,
parallel clients, separate-process locking, abandoned locks, callback attacks,
cancellation, port reuse, credential-write failure and retryable logout.

A synthetic native Keychain write/read/delete passed on the development Mac.
Linux Secret Service and Windows native-store acceptance remain release gates;
mocked adapter tests do not establish platform support. The full installable
artifact, crash/fault acceptance across supported OS targets, real Codex/Claude
journeys, hosted provisioning, deployment and enablement remain separate work.
THE-15 stays In Progress; THE-9's production acceptance is unchanged.

October 28, 2026 local verification: `pnpm verify` passed on Node 24.21.0,
with the three existing optional/performance tests skipped. The focused suites
passed 15 worker-auth tests, both real-provider OAuth flows and two provisioning
repair/rollback tests. Architecture and convention baselines remain empty; no
migration or production provisioning was performed.
