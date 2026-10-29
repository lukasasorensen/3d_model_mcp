# Worker release procedure

THE-15 remains In Progress. First supported target is Apple Silicon macOS with
Node 24; THE-32 tracks Intel macOS, Linux x64 and Windows x64. Linux CI smoke is
retained but does not establish supported-platform acceptance.

October 29 local evidence: full `pnpm verify` passed. Installed Codex 0.164.0 and
Claude Code 2.1.310 recognized generated version-pinned stdio settings through
`mcp get`, using disposable external directories (custom Codex home and Claude
project scope). Claude's project connection remained unapproved. This checks actual
configuration parsing only; it does not establish authenticated client journeys.

The owner selected public `@tfoundry/local-worker` after `@theoryfoundry` was
unavailable. npm account and organization ownership were verified locally on
October 29, 2026. Public downloads require no npm login. Publishing requires the
owner's npm authentication/MFA; never copy it into client settings or arguments.
TheoryFoundry OAuth remains a separate credential boundary.

## Candidate and inventory

Start from the reviewed, committed release checkout with pinned Node/pnpm. Obtain
explicit authorization before merging release PRs. Keep publication manual.

```sh
pnpm verify
WORKER_RELEASE_VERSION=0.1.0-rc.1 pnpm pack:worker
node tooling/local-worker/inspectRelease.script.mjs \
  dist/packages/tfoundry-local-worker-0.1.0-rc.1.tgz \
  > dist/worker-release-inventory.json
node tooling/local-worker/packedAcceptance.script.mjs \
  dist/packages/tfoundry-local-worker-0.1.0-rc.1.tgz
```

The build records commit and dirty-checkout state in the tarball. Inspection rejects
a dirty build, a different commit, or a dirty current checkout. Its JSON records
version, SHA-256, npm SHA-512 integrity, exact dependencies, and each packaged file's
size/hash. It is an inventory, not licensing clearance or a secret scanner.
Review the exact bundled code, manifest and notices before publication. Preserve
the tested tarball; do not rebuild between acceptance and publishing.

Packed acceptance uses a fresh external HOME, cache, registry configuration and
store. Full mode exercises cold/warm setup, real PNG, corrupt-cache detection and
explicit repair, native adapter diagnostics, offline MCP discovery and EOF cleanup.
It reports wall time for setup, including dlx and PNG smoke. It does not measure
hosted request counts, CPU or memory. `--smoke` retains the Linux CI boundary.

## Distribution gate — unresolved

The package still declares `UNLICENSED` for TheoryFoundry code. The owner must choose
distribution terms compatible with the complete delivered work. Do not publish until
the [OpenSCAD source audit](worker-source-audit.md) is resolved and notices/source
delivery have been reviewed. A public npm organization alone does not resolve this.

## Hosted and real-client acceptance

Follow the [hosted handoff](worker-hosted-handoff.md). Use the existing production
origin and clearly named `THE-15 acceptance — Codex` and `THE-15 acceptance — Claude`
projects. Keep normal projects, accounts, secrets and storage intact.

For each real client, record its version and the exact tarball/inventory digest.
Run setup from a disposable Git repository outside this checkout, using project
scope, and review the generated connection. Also exercise global scope with custom
CODEX_HOME using preserved client settings. Before registry publication a temporary
stdio command may point to the installed candidate; label that evidence as local
candidate acceptance, not registry delivery. Restart the client after setup.

1. Complete OAuth in the system browser; confirm native Keychain storage. Never
   save authorization codes, refresh/access tokens or raw HTTP logs in evidence.
2. Close all hosted project tabs. In Codex, then Claude Code, use the actual tools
   to create/read the named project, propose a simple model, validate it, request
   PNG and describe the image, promote the exact candidate, and export STL and 3MF.
   Record actual tool calls/results, project/revision IDs and whether the client
   consumed and displayed the image. Do not infer image consumption from delivery.
3. Download the receipts' artifacts and verify their hashes and parsed geometry.
   Reopen the hosted project only after local work to check revision visibility,
   then close it for the remaining tests.
4. Submit invalid source and confirm rejection without promotion. Interrupt a
   bounded complex render; confirm process/listener closure and lease cancellation
   (or documented expiry following disconnection), then successfully render again.
5. Interrupt network access for the acceptance worker, confirm safe failures and
   lease expiry/cleanup, restore it, and repeat successfully. Avoid disrupting the
   deployment or unrelated clients to simulate failure.
6. Restart the worker, then run two worker processes for the same account/origin
   concurrently to exercise refresh rotation. Confirm both succeed and a later
   restart still succeeds. Run logout, confirm stored refresh access is removed,
   and confirm reauthorization is required. Also revoke from Connected Apps and
   verify hosted access is denied. Reauthenticate only if needed for the next run.

Record cold/warm durations, process CPU/RSS samples with the measurement interval,
and available hosted request counts/durations, DB writes and transfer sizes. Mark
unavailable metrics as unavailable. Do not calculate savings from these alone.
THE-9 may reuse overlapping evidence but retains its separate browser criteria.

## Publish and repeat from npm

Only after distribution and candidate acceptance gates pass, publish the inspected
tarball using the owner's local npm session and MFA:

```sh
npm publish dist/packages/tfoundry-local-worker-0.1.0-rc.1.tgz \
  --registry=https://registry.npmjs.org/ --access public --tag next
node tooling/local-worker/packedAcceptance.script.mjs \
  dist/packages/tfoundry-local-worker-0.1.0-rc.1.tgz --published
```

`--published` checks unauthenticated npm metadata and exact downloaded tarball bytes
against the local candidate, then runs fresh dlx acceptance against npm. Under the
updated public scope, unauthenticated success is required; the superseded private
plan's unauthenticated-denial criterion no longer applies. Separately verify the
owner's authenticated install and repeat both real-client journeys using the
registry-delivered command registered by setup.

After prerelease acceptance, build without WORKER_RELEASE_VERSION for `0.1.0`,
inspect and test that exact tarball, publish with `--tag latest`, and repeat public
download/registry/client verification. Keep versions immutable. On a faulty release,
deprecate it and publish a new version; removing a dlx cache does not revoke OAuth.
Only then update THE-15 to Done and fetch it to confirm the saved state.
