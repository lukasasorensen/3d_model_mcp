# Development workflow

Use Node 22 and the pinned `packageManager` version with `pnpm install --frozen-lockfile`.
The separate Node 24 migration is THE-31. Existing development, database, authentication,
OAuth provisioning and headless-renderer commands remain in `package.json`.

| Command                                     | Purpose                                                           |
| ------------------------------------------- | ----------------------------------------------------------------- |
| `pnpm dev`                                  | Prepare browser assets and start the site                         |
| `pnpm test:list`                            | List all discovered tests grouped by owning project               |
| `pnpm test:tooling`                         | Run focused tooling regressions                                   |
| `pnpm test`                                 | Build packages, then run every discovered test in its owner's cwd |
| `pnpm --filter @theoryfoundry/runtime test` | Run only runtime-owned tests after building dependencies          |
| `pnpm format:check`                         | Check Prettier against exact legacy content exceptions            |
| `pnpm check:conventions`                    | Check naming, test placement and physical line caps               |
| `pnpm lint` / `pnpm typecheck`              | Existing ESLint and workspace TypeScript checks                   |
| `pnpm build`                                | Build libraries and the Next.js app                               |
| `pnpm verify`                               | Run all checks, tests and builds without rewriting source         |

New and touched files use Prettier. Format an explicit file with
`pnpm exec prettier --write path/to/file`, then remove its resolved baseline fields.
Do not format the entire legacy tree outside its owning stage. The baseline policy is
in [architecture conventions](architecture-conventions.md).

Discovery includes `.test` and `.spec` files with mjs/cjs/js/ts/tsx extensions, regardless
of depth, excluding known output/dependency directories and symlinks. Mixed TypeScript
suites use `tsx`. Nested workspaces belong to their closest package, so model-project
is not run twice. Test fixtures must not embed executable test files in the repository;
create disposable fixture trees during the test instead. Test files are explicit CLI
arguments, so Node's own implicit discovery does not decide coverage.

The ordinary suite uses local fixtures and PGlite, without production credentials.
Three existing tests are skipped in the default suite. The 20-run p95 budget test
in `canonical-journey.test.mjs` is explicitly disabled with `test.skip`; no timing
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
The temporary-Git-repository tooling regression skips only when the Git executable is
absent (such as a slim build image); it runs in checkout CI. The other tooling tests
remain independent of Git. The convention commands themselves never skip missing history.

Use short-lived `codex/<ISSUE-ID>-<slug>` branches. Read the issue first, verify saved
Linear updates, open a focused PR with correct issue linkage, and distinguish code
completion from deployment/acceptance. Merge only when explicitly requested, after
rechecking head and required checks. Branch protection is separate from adding CI.

As checked on 2026-10-26, `master` is unprotected (the protection API returns 404).
This PR adds CI but does not configure a required-check or PR-only merge policy.
