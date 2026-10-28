# Development workflow

Use Node 24.21.0 from `.node-version` and pnpm 11.17.0 from `packageManager`.
Run `fnm exec --using 24 pnpm install --frozen-lockfile`; use that Node version for every command below. Existing development, database, authentication,
OAuth provisioning and headless-renderer commands remain in `package.json`.

| Command                                     | Purpose                                                                |
| ------------------------------------------- | ---------------------------------------------------------------------- |
| `pnpm dev`                                  | Prepare browser assets and start the site                              |
| `pnpm test:list`                            | List all discovered tests grouped by owning project                    |
| `pnpm test:tooling`                         | Run focused tooling regressions                                        |
| `pnpm test`                                 | Build packages, then run every discovered test in its owner's cwd      |
| `pnpm --filter @theoryfoundry/runtime test` | Run only runtime-owned tests after building dependencies               |
| `pnpm format:check`                         | Check Prettier formatting with zero legacy exceptions                  |
| `pnpm check:architecture`                   | Check workspace/layer/browser dependencies with zero legacy exceptions |
| `pnpm test:architecture`                    | Run graph, barrel, alias and baseline regressions                      |
| `pnpm check:conventions`                    | Check naming, test placement and physical line caps                    |
| `pnpm lint` / `pnpm typecheck`              | Typed flat ESLint and source/test TypeScript checks                    |
| `pnpm build`                                | Build libraries and the Next.js app                                    |
| `pnpm verify`                               | Run all checks, tests and builds without rewriting source              |

All handwritten files use Prettier where a parser is available. Format explicit files
with `pnpm exec prettier --write path/to/file`. Every handwritten text file is capped
at 500 physical lines, including tests, configuration and docs. Both legacy baselines
are empty and must stay empty; see [architecture conventions](architecture-conventions.md).

Discovery includes `.test` and `.spec` files with mjs/cjs/js/ts/tsx extensions, regardless
of depth, excluding known output/dependency directories and symlinks. Mixed TypeScript
suites use `tsx`. Nested workspaces belong to their closest package, so model-project
is not run twice. Test fixtures must not embed executable test files in the repository;
create disposable fixture trees during the test instead. Test files are explicit CLI
arguments, so Node's own implicit discovery does not decide coverage.

The ordinary suite uses local fixtures and PGlite, without production credentials.
Three existing tests are skipped in the default suite. The 20-run p95 budget test
in `packages/runtime/tests/canonicalPerformance.integration.test.mjs` is explicitly disabled with `test.skip`; no timing
acceptance is claimed. Two opt-in runtime tests require provisioned test databases: the standalone stdio test
uses `THEORYFOUNDRY_TEST_DATABASE_URL` and `THEORYFOUNDRY_TEST_ACTOR_USER_ID`; export
concurrency uses `THEORYFOUNDRY_TEST_EXPORT_DATABASE_URL`. Report these skips separately.
Compose configuration tests require Docker Compose (CI checks its presence); they do
not start production services. Do not claim live or real PostgreSQL acceptance from PGlite.

CI runs on PRs and pushes to the existing `master`, with read-only permissions and no
secrets. It installs from the frozen lockfile, runs `pnpm verify`, and checks tracked-file
nonmutation. `ALIGNMENT_BASE_REF` is the PR base SHA or pre-push SHA; local checks use
`origin/master` and require Git history. Docker intentionally excludes Git metadata:
its existing build checks remain unchanged; run full verification in a Git checkout.
Temporary-Git-repository tooling regressions skip only when the Git executable is
absent (such as a slim build image); they run in checkout CI. The other tooling tests
remain independent of Git. The convention commands themselves never skip missing history.

Use short-lived `codex/<ISSUE-ID>-<slug>` branches. Read the issue first, verify saved
Linear updates, open a focused PR with correct issue linkage, and distinguish code
completion from deployment/acceptance. Merge only when explicitly requested, after
rechecking head and required checks. Branch protection is separate from adding CI.

As checked on 2026-10-26, `master` is unprotected (the protection API returns 404).
CI does not itself configure a required-check or PR-only merge policy.

Internal tooling paths and architecture checks are documented in
[architecture enforcement](architecture-enforcement.md). The installed-Codex smoke test
also skips when the Codex CLI is absent (including hosted CI); record that separately.

TypeScript checks source and mirrored TypeScript tests without emitting. Each library
uses `tsconfig.build.json` to emit declarations, source maps and JavaScript from `src/`
only. Next.js keeps its bundler configuration. Strict optional properties, type-only
imports, return types and promise handling are enforced; generated assets are excluded.
See [Node 24 toolchain verification](node24-toolchain.md) for pins and compatibility patches.

The private worker authentication harness uses `pnpm worker:auth login <origin>`
and `pnpm worker:auth logout <origin> <account-id>` after building packages.
See [worker authentication](local-worker-authentication.md) for secure storage,
operator provisioning, lock recovery and the remaining release gates.
