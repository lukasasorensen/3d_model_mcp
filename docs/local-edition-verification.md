# Local edition verification

Tracking: [THE-50](https://linear.app/theoryfoundry/issue/THE-50).
Application/plugin 0.8.0, local-worker/contracts/gateway 0.3.0, runtime 0.7.0,
MCP 0.2.0. No new database migration or renderer pin change.

## Automated checks

- Node 24.21.0 and pnpm 11.17.0 on Apple Silicon macOS.
- Final full `pnpm verify`: passed. It ran 434 Node tests (431 passed, three
  existing PostgreSQL/performance skips), all 64 browser checks, formatting,
  conventions, architecture, package boundaries, lint, type checks and production build.
- Focused checks cover encrypted backup authentication/tampering, isolated restore,
  failed upgrade fencing across worker versions, locked-store shutdown, connection
  origin/account preservation, export integrity/overwrite protection, local HTTP
  policy, first-account admission and published-port Host/Origin validation.
- Gateway tests exercise real loopback HTTP with streamed bodies, cookies and
  foreign Host/Origin rejection. Compose config verifies the only published
  service is the loopback gateway; the app and database remain private.
- The installed Codex CLI accepted the local plugin in an isolated home without
  registering a hosted MCP connection. The bundled skill validator passed.
- Application and tooling Docker targets built successfully with bounded fixture
  concurrency. Image builds omit checks requiring absent Docker/Codex/Claude CLIs;
  those checks run on the host or CI with the required tools.
- The worker tarball includes the Compose/release manifests and the exact pinned
  runtime. External npm installation with lifecycle scripts disabled succeeded.

## Real local acceptance

Run the opt-in harness against an installed tarball outside the checkout:

```sh
pnpm acceptance:local-edition --cli /absolute/installed/dist/cli.js
```

It uses disposable installation homes, accounts, native credentials and Compose
projects. Cleanup removes only those installations' containers, volumes and secret
entries. Credentials, passwords, OAuth queries/codes and setup URL fragments are
never emitted in evidence.

Verified on the candidate using Docker Engine 29.7.2:

- New instance migrations and first-journal initialization.
- Actual Chromium browser account creation and rejection of repeat bootstrap.
- Local OAuth/PKCE consent, native Keychain storage, and packed CLI connection.
- Packed CLI discovery, project creation, source proposal, validation, PNG preview,
  promotion, receipt-verified STL/3MF downloads and parsed geometry.
- Closed project browser during CAD computation.
- Restart preserves the authoritative revision.
- The app cannot fetch an external HTTPS site on this Docker engine.

The encrypted cold snapshot restored successfully into fresh volume names and a
new origin. The restored app started, its database retained the project, and its
stable authentication secret matched the backed-up instance. The source instance
was preserved until fixture cleanup.

## Findings corrected during acceptance

- A new journal needs an explicitly initialized managed marker before replay.
  Initialization is recorded once; later starts do not recreate missing markers.
- Next.js reconstructs its internal URL behind a published port. Bootstrap checks
  the external Host and exact Origin instead of trusting that internal URL.
- Disabling bridge masquerading did not block Docker Desktop egress. Internal-only
  networks blocked egress but also prevented host access. A fixed-upstream gateway
  exposes localhost while leaving the app/database internal-only.
- Node fetch did not honor the custom Host needed by the gateway health probe.
  Its health check uses the Node HTTP client instead.
- Docker snapshot restore needs explicit interactive stdin forwarding. The restore
  command now preserves the streamed archive instead of closing container stdin.

## Remaining release gates

This is local candidate evidence, not registry delivery, public distribution,
production deployment, or a real Codex model following the skill through a task.
OAuth consent in the harness is driven through HTTP against the actual local
provider after browser signup; an interactive end-user consent click-through and
real Codex skill invocation remain acceptance work.

The runtime used existing Chromium/renderer caches. Cold public-registry delivery,
other platforms/clients, public npm/image/plugin publication, and the unresolved
OpenSCAD distribution requirements under THE-15 remain separate gates. Nothing was
merged, published or deployed to hosted TheoryFoundry by this implementation.
