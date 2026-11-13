# Hosted MCP plugin release

THE-44 makes plugins the primary hosted installation path for Codex and Claude Code.
PR #48 retains the optional Codex npm installer and the existing public installer URL.
The hosted `/mcp` endpoint, browser renderer and account/project authorization stay
shared. Public directory publication and live client acceptance remain release gates.

## Source and packages

`plugins/theoryfoundry/` owns the shared identity, publisher metadata, logo and setup
skill. `tooling/mcp-plugin/` builds client packages and local validation catalogs.
Publisher: Lukas Sorensen. Production origin: `https://3dai.theoryfoundry.com`.
Version: 0.9.0, matching the root release. The site is at 0.8.1, the runtime at
0.7.0, and the optional npm installer at 0.2.0.

```sh
pnpm pack:plugins
claude plugin validate --strict dist/mcp-plugins/claude
```

The output under `dist/mcp-plugins/` includes Codex and Claude plugin folders,
versioned ZIPs, local catalogs and `release-readiness.json`. Only the manifest,
MCP settings, README, SVG logo and setup skill enter each ZIP. Application source,
credentials, scripts, hooks, local renderer assets and dependency trees are excluded.

Both packages use their clients' documented compatibility manifests:
`.codex-plugin/plugin.json` or `.claude-plugin/plugin.json`, plus `.mcp.json`.
This supports the clients' explicit OAuth fields and Codex's tool timeout today.
The current portable MCP 1.0 schema has `additionalProperties: false` without OAuth
extensions, while OpenAI documents vendor auth extensions separately; do not claim
strict portable-schema conformance for these authenticated compatibility packages.
Validate the client-native artifacts rather than silently dropping OAuth settings.

The skill only helps connect, select a project and diagnose authorization/rendering.
It does not grant permission to edit a model or automatically install the npm helper.

## Operator OAuth provisioning

Apply existing migrations before provisioning; this change adds no schema migration.
Use the same public-origin environment and database as the deployed application.
The commands add exact callbacks and preserve an existing disabled client. `--replace`
replaces that profile's callback list; omit it when adding another approved callback.

```sh
pnpm oauth:provision -- --profile openai-plugin http://127.0.0.1/callback
pnpm oauth:provision -- --profile claude-code http://localhost/callback
```

Profiles use separate public client IDs: `theoryfoundry-openai-plugin` and
`theoryfoundry-claude-code`. They require PKCE, user consent, `cad:tools offline_access`,
and the exact application MCP resource. Client secrets are unused. Legacy Codex and
worker provisioning remain available and retain their identities and callback policy.

Register the exact HTTPS callback reported by each public directory through the same
profile command when its hosted connection flow needs one. Never guess that URL or
allow wildcard callbacks. Native HTTP callbacks retain loopback port variance supported
by the provider; the local worker's existing fixed-port policy is unchanged.
Provisioning is transactional, repairs public-client security settings, preserves
disablement, and removes unrelated resource mappings. Do not enable public DCR.

## Public directory submission

Draft support, privacy and terms pages now exist at `/support`, `/privacy` and `/terms`.
They are not approved public-release policies yet: see [public page review](public-pages.md),
including the deletion prerequisite tracked in THE-45. The review recording is also
pending. Fill `plugins/theoryfoundry/publication.metadata.json` only after the final pages
are deployed, publicly accessible and verified, using the production origin plus those
paths, and add a reviewer-accessible recording. Then run:

```sh
pnpm pack:plugins --release
```

This checks publication metadata, not approval or live acceptance. The readiness report
also lists publisher/domain verification, reviewer accounts, directory approval and
real-client acceptance. Never treat a successful build as completion of those items.

Prepare a dedicated review account with sample owned projects using the existing
operator account-provisioning process. Keep reviewer passwords outside Git, packages
and Linear. Prepare the five positive and three negative scenarios in
[plugin acceptance](plugin-acceptance.md), record them, and enter private review
credentials through the directory's own review form.

Upload the Codex ZIP through OpenAI's **With MCP** submission route, configure its
provided public client with token authentication method `none`, verify the domain,
and resolve the portal's checks before submitting. A valid setup skill is included
because the current public validation rules require one for this remote-plugin ZIP.

Publish only the generated plugin folders/catalogs into a dedicated public distribution
repository; keep the application repository's code outside that publication boundary.
For Anthropic, submit from its directory developer portal, and verify that the installed
listing syncs into Claude Code. Anthropic's official `claude-plugins-official`
marketplace is a separate route; directory submission does not automatically list there.
Record assigned plugin identities and listing URLs before advertising them.

## Onboarding activation and release ordering

Deploy compatible authentication/provisioning before publishing listings. After each
listing is published and verified, set the following server-side environment variables:

```text
THEORYFOUNDRY_PLUGIN_ORIGIN=https://3dai.theoryfoundry.com
THEORYFOUNDRY_CODEX_PLUGIN_URL=<verified-public-Codex-listing>
THEORYFOUNDRY_CLAUDE_PLUGIN_URL=<verified-public-Claude-listing>
THEORYFOUNDRY_CODEX_NPM_AVAILABLE=0
```

Listing URLs must use HTTPS. The UI only offers a catalog link when the configured
plugin origin exactly matches the current deployment. Otherwise manual setup remains
available with the correct origin. It does not advertise an unpublished npm version.
After publishing and verifying `@tfoundry/connect-codex@0.2.0`, set the npm availability
flag to 1 to expose that optional Codex path under Advanced setup.

Merge through develop, promote through master only when explicitly authorized, and
track implementation, backend deployment, directory publication and client acceptance
separately. Keep THE-44 open until both public client journeys pass.

References: [OpenAI packages](https://developers.openai.com/plugins/build/plugins),
[public submission](https://developers.openai.com/plugins/deploy/submission),
[Claude distribution](https://code.claude.com/docs/en/plugins/publish).
