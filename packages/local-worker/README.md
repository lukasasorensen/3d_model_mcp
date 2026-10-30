# TheoryFoundry local worker

Use Node 24 and an enabled TheoryFoundry hosted server. The worker stores refresh
credentials in the OS credential store and runs CAD computation locally in
sandboxed Chromium. No repository, Docker, local database or visible project tab
is needed by the installed package.

After this version has been published to your configured registry:

```sh
pnpm --silent dlx @tfoundry/local-worker@0.1.0 setup
pnpm --silent dlx @tfoundry/local-worker@0.1.0 login --server https://your-server.example
pnpm --silent dlx @tfoundry/local-worker@0.1.0 serve --server https://your-server.example --account <account-id>
pnpm --silent dlx @tfoundry/local-worker@0.1.0 doctor --json
pnpm --silent dlx @tfoundry/local-worker@0.1.0 logout --server https://your-server.example --account <account-id>
```

For guided registration, run:

```sh
pnpm --silent dlx @tfoundry/local-worker@0.1.0 setup --server https://your-server.example --client codex --scope global
```

Use `--client claude` for Claude Code, or `--scope project` from a Git repository root.
Setup opens TheoryFoundry authorization and writes a version-pinned connection only
after rendering and login succeed. `--account <account-id>` reuses an existing login.
Configuration changes receive private backups. Identical reruns are harmless;
conflicts and symlink paths are rejected. Codex respects an absolute `CODEX_HOME`.
Claude global setup uses its user configuration; custom `CLAUDE_CONFIG_DIR` requires
manual registration. A failed configuration write leaves the authenticated account
available for retry. Project files include the account ID; review before sharing.

Login prints the account ID. Use the exact same server/account for serve and logout.
For MCP configuration, command is `pnpm`, args are `--silent`, `dlx`,
`@tfoundry/local-worker@0.1.0`, `serve`, `--server`, your origin, `--account`,
your account ID. Pin the package version; do not use `latest` in a client config.
`serve` writes only protocol messages to stdout and never installs software or
opens a login prompt. Setup and login are separate terminal commands.

Setup explicitly downloads the Chromium revision pinned by Playwright, then checks
packaged asset hashes and renders a PNG. Verified renderer files are cached under
`~/Library/Caches/theoryfoundry-worker/renderers` (or `XDG_CACHE_HOME` when set),
keyed by the complete asset manifest digest. Setup repairs corrupt/partial caches;
serve and doctor only verify them. Browser installation uses Playwright's OS cache;
keep the same `PLAYWRIGHT_BROWSERS_PATH` if you override it across setup and serve.
Linux may need Chromium system dependencies and a running Secret Service. Setup
never invokes sudo or installs system packages. Install optional dependencies:
the native credential adapter uses platform-specific optional packages.

Doctor checks the renderer and native binding without accessing any account.
Add `--server <origin> --account <account-id>` to check credential access and
OAuth; this may rotate the stored refresh token. JSON output contains only
status and safe diagnostics. Failures exit nonzero. Login/logout reuse the worker
PKCE, token verification, OS storage and refresh coordination lifecycle. Logout
revokes before removing the local credential; if revocation fails, retry logout.
Previously issued access tokens may remain valid briefly; Connected Apps grant
revocation provides immediate hosted denial.

HTTPS origins must be canonical, without paths or a trailing slash. Local HTTP
requires explicit `--allow-loopback-http`. Never pass tokens as arguments.
Use `--help` for command syntax. Setup, doctor and login can be cancelled with
Ctrl-C. Serve also cleans up on EOF/SIGINT/SIGTERM; known leases receive bounded
cleanup requests, with hosted expiry as the fallback after disconnection/crash.

To upgrade, run setup for the chosen published version, run doctor, then replace
the version in your MCP configuration. Keep the server/account pair unchanged.
To remove access, run logout while the host is reachable before removing the MCP
configuration. Removing a dlx cache alone does not revoke stored credentials.
The worker does not persist CAD source or exported artifacts locally; Chromium's
cache and nonsecret credential lock directories are separate from OS secrets.

This package has not been published by the packaging PR. The first release targets Apple Silicon macOS; other platforms are tracked in THE-32.
Public distribution uses the tfoundry npm organization and needs no downloader npm
login. Publication, distribution licensing and real Codex/Claude acceptance remain
release gates. Runtime checks are not production acceptance.
