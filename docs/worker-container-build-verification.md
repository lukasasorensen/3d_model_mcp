# Worker onboarding container build prerequisites

October 30, 2026; contributes to THE-15.

PR #26 added project-scoped setup tests that create a temporary Git repository and
exercise the real `git rev-parse` root check. The production Dockerfile runs those
tests during its build, but `node:24.21.0-bookworm-slim` does not include Git.
The same image running Node 24.21.0 reproduced `spawnSync("git", ["--version"])
with error `ENOENT`.

Install Git with no recommended packages in the `build` stage before tests. The
independent final `runtime` stage still starts from the original slim image.
Do not skip the project-setup tests or alter the user's runtime requirements to
make the container build pass.

CI now has a separate `container-build` job that builds the actual production
runtime target, including its build-stage tests. The host-side `verify` job alone
could not detect this missing dependency because Git exists on GitHub's runner.

## Verification and rollout boundary

- Local `pnpm verify` passed with the Dockerfile/CI changes.
- The Git-dependent setup test passed inside the corrected Docker build.
- The first full local image build exhausted memory while executing other runtime
  integration tests concurrently with host verification. The isolated retry passed
  every Docker build-stage test and produced the final Linux arm64 runtime image.
  Runtime inspection confirmed UID 1001 and no Git executable. Linux amd64 CI is a
  separate check; local arm64 success does not establish its result.
- Coolify's automatic #26 and #27 deployments failed, and the previous production
  image `a2ef333108522b4cf68885c1501bea324fda4f9b` remained healthy. Operator build
  logs were requested; the missing Git prerequisite is independently reproduced,
  but the exact production failure has not yet been confirmed from those logs.

Merge requires explicit authorization after current CI passes. Then verify the
automatic deployment, effective worker flags and authenticated worker behavior.
Preserve existing database volumes and accounts; this fix needs no migration.
