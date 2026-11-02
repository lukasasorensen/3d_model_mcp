# Connect Codex to TheoryFoundry

Install Node.js 24 or newer (including npm/npx) and the Codex CLI, then run:

```sh
npx --yes @tfoundry/connect-codex@0.2.0 https://YOUR-CAD-DOMAIN global
```

Sign in and approve CAD access in your browser. Restart Codex or start a fresh
session after authorization. Keep the matching CAD project tab visible while
rendering through the hosted server.

Use `project` instead of `global` to configure only the current Git repository.
Run that command from the repository root, and trust the repository in Codex.
Configuration scope controls where the server is available; your account still
determines which CAD projects you can access.

The installer connects to `<application-origin>/mcp`. HTTPS is required except
for HTTP loopback origins used in local development. `global` writes
`$CODEX_HOME/config.toml`, defaulting to `~/.codex/config.toml`; `project` writes
`.codex/config.toml` in the repository. Existing configuration text is preserved,
and changed files are backed up. Identical settings can be installed again;
conflicting entries are left unchanged.

Authorization runs through `codex mcp login`. The installer requests `cad:tools`
and `offline_access`, using the public `theoryfoundry-codex` client. If login fails,
the configuration remains installed and a retry command is printed.

Run `npx --yes @tfoundry/connect-codex@0.2.0 --help` for usage. This package has
no runtime dependencies or install scripts. Its bundled TOML parser's license is
included in the executable. TheoryFoundry code is proprietary.
