# Installable local worker

THE-15 packages the existing stdio worker as `@theoryfoundry/local-worker@0.1.0`.
The CLI provides `setup`, `serve`, `login`, `logout`, `doctor`, `--help` and
`--version`. See the [package README](../packages/local-worker/README.md) for
version-pinned client configuration and commands after registry publication.

## Build and artifact boundary

Use the pinned Node 24.21.0 and pnpm 11.17.0 toolchain:

```sh
pnpm install --frozen-lockfile
pnpm pack:worker
pnpm acceptance:worker-package
```

`pack:worker` builds workspace packages and the pinned renderer assets, generates
`dist/local-worker-package`, then writes
`dist/packages/theoryfoundry-local-worker-0.1.0.tgz`. The workspace package version
is the release version. Update it and the documented version-pinned examples
together for the next release. This command does not publish anything.

The workspace packages retain their names and remain private. The generated
manifest exposes one executable, `theoryfoundry-worker`, and bundles the internal
worker/authentication/renderer/contracts code. Runtime npm dependencies have exact
versions from the installed lockfile graph; native optional packages remain npm
dependencies. Transitive resolution follows those packages' published manifests.
No `workspace:`, repository-relative import, source map, database package,
development dependency or repository checkout is required at runtime.

The tarball includes the HTML/JS renderer, existing hash-pinned OpenSCAD/WASM and
BOSL2 assets, usage documentation and upstream notices. There are no lifecycle
scripts. Installation does not download Chromium, access credentials or prompt
for login. `setup` explicitly installs the pinned Playwright Chromium revision
and renders a PNG; repeated setup reuses its browser cache. Linux system packages
and Secret Service are operator prerequisites. Setup never invokes sudo.

`serve` preserves the local worker's cancellation and cleanup behavior and uses
the packaged version in MCP initialization. It lazily loads credential bindings
on the first authenticated operation. Offline initialization/tool discovery needs
neither Chromium nor an unlocked credential store. Login and logout reuse the
existing PKCE, refresh coordination and revocation lifecycle.

`doctor --json` verifies the renderer and loads the native credential binding.
It accesses an account only when explicitly given both `--server` and `--account`;
that optional check can refresh a credential. JSON reports safe statuses, not
tokens or upstream error bodies. Missing prerequisites produce a nonzero exit.

For repository development, build packages/assets and run `pnpm worker --help`
or `pnpm worker setup`. The existing `worker:serve` and `worker:auth` harnesses
remain available.

## Packed acceptance

`packedAcceptance.script.mjs` inspects the actual tarball's manifest and allowlisted
contents, then serves that name/version through a disposable loopback npm registry.
Dependency metadata is proxied read-only to npm; no registry credentials are used.
Each run creates an external working directory, HOME, npm configuration, dlx cache
and pnpm store. The worker is launched as
`pnpm --silent dlx @theoryfoundry/local-worker@0.1.0`, without workspace imports.
The fixture registry and temporary directories are cleaned up afterward.

The full check covers help/version, missing-browser diagnostics, repeated setup,
cold Chromium download, real PNG rendering from packaged assets, native binding loading, login/logout
argument validation, synthetic-account credential diagnostics, and offline stdio
initialization/listing of eleven tools followed by EOF cleanup. Chromium uses an
empty temporary browser cache outside the repository. No production account is used.

The macOS arm64 run on Node 24.21.0 passed. Native binding loading passed; the
synthetic account in the isolated HOME reported `CREDENTIAL_STORE_UNAVAILABLE`.
Doctor and logout failed closed as expected. This does not establish successful
real-account keychain access or end-to-end OAuth from the tarball.

CI builds the tarball after `pnpm verify` and runs the same external dlx harness
with `--smoke`, which omits browser installation/rendering and account-store access.
The ordinary CLI tests cover command routing, argument rejection, cancellation,
safe diagnostics and renderer cleanup with injected capabilities.

## Remaining release gates

Registry publication/access and distribution terms are separate release decisions;
see [third-party notices](../packages/local-worker/THIRD_PARTY_NOTICES.md).
Supported-platform browser/native-store checks, real OAuth login/rotation/logout,
and real Codex/Claude validation/PNG/STL/3MF journeys with the project tab closed
remain acceptance work. Hosted provisioning, flags, migrations, deployment and
enablement require their own rollout. THE-15 remains In Progress. THE-9 retains
production browser/OAuth/render/export acceptance.
