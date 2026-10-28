# Stage 7 final alignment

THE-30 starts from merged PR #20 (`8b99713559c39980234e54e3f13617f53e59d718`).
All 27 remaining convention records are removed; both legacy baseline inventories
are empty. Current checks reject any nonempty baseline, including unchanged records
from an older comparison commit. Historical provenance and base-history checks remain.

## Final structure

- Runtime launchers are root `stdioServer.composition.ts`,
  `provisionUser.composition.ts` and `provisionOAuthClient.composition.ts` files.
  Public `pnpm mcp:serve`, `auth:provision` and `oauth:provision` commands target the
  renamed emitted files. Old internal launch paths and special classifier rules are gone.
- Standardized `/.well-known` HTTP discovery handlers keep their URLs. Naming checks
  recognize this root framework route segment only; ordinary dot folders still fail.
- `apps/site/src/app/styles.css` imports foundation, workspace, viewer, model details,
  chat, responsive/accessibility, authentication, onboarding and final visibility
  rules in their original order. Every formatted stylesheet is below 500 lines.
- The README links focused local/database, MCP client and CAD operation guides.
  Current design/development/architecture references use migrated source paths;
  earlier stage inventories retain their clearly identified historical paths.
- Generated exemptions are limited to known artifacts, lockfile, migration SQL/meta,
  dependencies and build output. Handwritten code placed in a generic `vendor` or
  Drizzle folder is no longer exempt. All handwritten text stays below 500 lines.

## Preservation and verification

The [coverage inventory](test-coverage.md) lists all 92 test files and optional skips.
No package identity, public export, route, SQL, ownership check, renderer pin, flag,
Node version or deployment topology changes. The nine route edits, layout, ESLint,
Compose, tsconfig and canonical JSON fixtures are formatting only. Runtime executable
bodies are unchanged. The ordered combined CSS matches the formatted original apart from two blank lines.

Local Node 22 `pnpm verify` passed: **272 passed, 3 existing optional skips** across
92 files / 9 projects; site **63 passed**. Production build, package/client boundary,
architecture, formatting, conventions and installer checks passed. SHA-256 snapshots
of every tracked and untracked source file before/after verification were identical.
CI also checks `git diff --exit-code` after full verification on the PR head.

After a clean runtime build, both renamed provisioning launchers worked against a
disposable loopback PostgreSQL 18.6 database. The optional PostgreSQL stdio test
passed separately (1 passed / 0 skipped), exercising the renamed standalone process,
render claim/completion and promotion. Its renderer peer is a test fixture; actual
WASM execution was verified independently in the browser.

Authenticated development-browser acceptance passed sign-in, new project, keyboard
chat submission, WASM bracket rendering and R1 promotion (80 × 40 × 46 mm), chat
collapse/restore, onboarding dialog and Escape dismissal, and sign-out. Screenshots
confirmed desktop, 768 px tablet and 390 px mobile layouts after CSS extraction.
The final screenshot shows the rendered mesh and completed chat. Only a disposable
account/database and loopback flag fixture were used; no live flags changed. The
container and local processes were removed after acceptance.

Production-mode browser/OAuth acceptance is not claimed; the existing HTTPS origin
requirement remains. Deployment and live production acceptance are separate. THE-31
owns Node 24, flat ESLint, strict TypeScript and source-only build configurations.
