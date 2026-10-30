# Worker onboarding verification

October 29, 2026; THE-15. This change adds guided Codex/Claude registration and a
verified renderer cache. It does not publish the worker or complete live acceptance.

## Completed locally

- Apple Silicon, macOS 27.0.1, Node 24.21.0, pnpm 11.17.0.
- `pnpm verify` passed, including the full workspace build, tests, type checks,
  formatting, lint, architecture and package boundary checks.
- All 39 local-worker tests passed. New coverage exercises configuration backups,
  preservation, repeated setup, conflicts, custom Codex home, Claude user/project
  scopes, symlink rejection, cache corruption/repair and cancellation.
- `pnpm acceptance:worker-package` passed outside the repository using a fresh
  temporary HOME, registry, store and browser cache. It exercised exact-version dlx,
  cold Chromium installation, repeated setup, real PNG rendering, native binding
  loading, fail-closed isolated credential access and eleven-tool stdio/EOF cleanup.
- A separate synthetic write/read/delete against the normal macOS Keychain passed.
  This establishes native store access, not real OAuth acceptance.

## Publication and live acceptance boundary

The owner verified access to the `tfoundry` npm organization and chose public
distribution as `@tfoundry/local-worker`. Internal workspace identities are unchanged.
No npm credentials are needed to download the eventual public release. Project
access still requires TheoryFoundry OAuth; no reusable token enters client config.

The UI tells users to wait for an available release. Publication remains gated on
distribution terms, matching OpenSCAD source/build materials, and release acceptance.
The later [live acceptance record](worker-live-acceptance.md) covers successful
native login, refresh, logout, remote refresh-token revocation, Connected Apps
revocation, hosted UI visibility and the core Codex journey. Registry acceptance
remains pending. Claude Code acceptance is deferred to THE-33 by the owner;
THE-32 tracks deferred platforms.

Configuration follows the documented [Codex MCP interface](https://developers.openai.com/codex/mcp)
and [Claude Code MCP scopes](https://code.claude.com/docs/en/mcp). Global Claude
registration maps to user scope. Project setup requires a Git repository root;
clients may require project trust/approval before loading project configuration.
