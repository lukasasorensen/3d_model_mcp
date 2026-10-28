# Node 24 and strict toolchain alignment

THE-31 follows PR #21, merged as `fbbce9f`. It changes the development/build runtime;
production deployment remains separately authorized.

## Runtime and tooling

`.node-version`, CI and both Docker base stages pin Node **24.21.0**. Workspace
engines require `>=24 <25`; pnpm remains **11.17.0**. The installer targets Node 24
and requires at least that major; the headless proof package uses the workspace
Node range. Existing Next.js 15.5.22, React, database and renderer versions remain.

Pins match the template's compatible toolchain: TypeScript 5.9.3, ESLint 10.13.0,
`@eslint/js` 10.0.1, typescript-eslint 8.72.0, tsx 4.23.15, Node types 24.10.1,
Prettier 3.9.10 and dependency-cruiser 18.7.0. `globals` 17.13.0 supplies Node and
browser environments to the flat ESLint configuration.

## Enforcement and preservation

- Typed ESLint checks explicit returns, type-only imports, floating/misused promises
  and explicit `any`. Node test promises are deliberately voided: the test runner
  owns completion. React callbacks retain their existing async work and error handling behind
  synchronous event callbacks. The worker port explicitly supports async handlers.
- TypeScript enables exact optional properties, verbatim module syntax, unused
  declarations, explicit overrides and switch fallthrough checks. Capability contracts
  explicitly accept undefined where callers already forward an optional value;
  fetch/SDK options omit absent signals. No wire schema changes.
- Library `tsconfig.json` files check source and mirrored TypeScript tests without
  emission. `tsconfig.build.json` files emit only source to `dist/`, including
  declarations and source maps. Next keeps ESNext/bundler resolution and no emission;
  server packages keep NodeNext. Existing JavaScript tests still exercise builds.
- Database factories use a typed identity helper that preserves precise inferred
  table columns and deferred foreign-key references. Column builders retain their
  concrete SQL names, defaults and nullability. No migrations or SQL changes.
- Browser public boundaries, routes, worker/asset URLs, pins, flags, package identities
  and deployment topology are preserved. Both architecture baselines remain empty.

## Declaration compatibility patches

Two pnpm patches are installed from the frozen lockfile, including in Docker. They
change declarations only; dependency JavaScript and versions are unchanged.

- `@langchain/core@1.2.4`: Zod v3 compatibility `typeName`/`description` fields accept
  explicit undefined, matching Zod's own declarations. Without this, strict optional
  checking reduces the tool-call-limit input to `never` and rejects chat middleware.
- `better-call@1.4.0`: optional OpenAPI array `items` accepts explicit undefined,
  matching the OAuth provider's inferred metadata unions. Without this, the OAuth
  provider cannot satisfy Better Auth's plugin contract under exact optional checks.

Remove each patch when upstream declarations accept these shapes. Keep strict checking
and the existing authenticated OAuth/chat tests; do not replace the patches with casts
or compiler/lint suppressions.

## Verification

The toolchain regression suite checks runtime pin consistency, source-only emission,
source/test check coverage, and rejection of unchecked indexing, explicit undefined,
floating promises, implicit returns and value-only type imports. Existing regression
coverage remains intact.

Local Node 24 `pnpm verify` passed: **276 passed, 3 existing optional skips**, across
**93 files / 9 projects**; site **63 passed**. Production build, typed lint,
source/test typechecking, installer, package/client boundaries, formatting and
zero-exception architecture/convention checks passed. The same two opt-in PostgreSQL
tests passed separately (**2 passed / 0 skipped**): standalone MCP render/promotion
and worker export capacity/quota/terminal concurrency. The disabled p95 experiment
remains unclaimed.

Both Docker targets built successfully on the local arm64 engine using
`node:24.21.0-bookworm-slim` (base manifest digest
`sha256:d6aa754f16b3197301076f047b5def2f02ea1dbbc2ca920407d46d7ec7f87b20`).
The runtime reports Node v24.21.0 and UID 1001. Loopback smoke checks returned sign-in
200, public readiness 200, unauthenticated projects 401 and GET MCP 405; OpenSCAD glue
and WASM bytes match their pinned hashes. The operator image applied existing
migrations to a new disposable PostgreSQL 18.6 database, provisioned a disposable
user and provisioned the Codex OAuth client using the required canonical HTTPS origin.
Slim-image tests additionally skip installed-Codex and Git-dependent fixture scenarios;
checkout CI retains those Git tests and separately records absent Codex.

Authenticated development-browser acceptance on Node 24 passed sign-in, project
creation, Ctrl+Enter submission, real WASM bracket validation, R1 promotion, WebGL
geometry (80 × 40 × 46 mm), chat collapse/restore and sign-out. The 20,884-byte STL
was downloaded and its SHA-256 matched the receipt:
`a4b5a5f83020765f76c539f78b6c1e28478f681281f3b8fe10ea43e3c348ff86`.
The acceptance used a disposable database/account and a loopback flag fixture. All
temporary servers and containers were removed. No production migrations, deployments,
flags or template files changed. HTTPS production-browser/external-client acceptance
remains a separate release gate; it is not implied by these local checks.

During verification, clean-image linting exposed hidden `.well-known` routes missing
from TypeScript glob coverage; these are now explicitly included. Existing worker
and built-output tests caught an async callback contract regression and an accidentally
erased class export; both were corrected before the successful full runs.
