# Codex installer packaging and release

The hosted Codex installer is distributed as `@tfoundry/connect-codex`.
Its npm metadata is in `tooling/codex-connect/package.metadata.json`; the generated
package is outside the workspace under `dist/codex-connect-package/`. Existing
workspace packages retain their identities. The package contains only a manifest,
README and executable, including the bundled TOML parser and its license.

Use the pinned Node version from `.node-version`:

```sh
pnpm pack:codex-installer
pnpm test:codex-installer
pnpm verify
```

Packing rebuilds the public installer, checks it against its source, and prepares
`dist/packages/tfoundry-connect-codex-0.1.0.tgz`. The executable has a Node shebang
and reuses the public bundle. No runtime dependencies, credentials, install scripts,
local renderer assets or source maps are shipped.

Tests use an isolated npm cache, offline npx, a temporary Codex home, and a fixture
Codex CLI. They cover global and repository installation, backup preservation,
unchanged reruns, authorization failure/retry, and the exact OAuth arguments.
These checks do not establish live OAuth acceptance or public-registry availability.

Publish only an approved, verified tarball using an account with access to the
`@tfoundry` scope:

```sh
npm publish dist/packages/tfoundry-connect-codex-0.1.0.tgz --access public
npm view @tfoundry/connect-codex@0.1.0 version dist.integrity --registry https://registry.npmjs.org/
```

Publication must precede deployment of the onboarding command. Before promotion,
verify the exact public version from a clean cache with `--help`, then complete
the setup and browser authorization with an isolated Codex home against the target
deployment. Restart Codex and verify the hosted CAD tools in a fresh session.
Keep implementation, npm publication, application deployment and live acceptance
separate in Linear; a successful package test is not live acceptance.

For future releases, update the metadata version and the onboarding command's
exact version together. The command test checks them against each other. Preserve
the public installer URL and existing deployment-specific server identities.
