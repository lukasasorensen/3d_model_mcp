# Hosted plugin verification

Use Node 24.21.0 and the package manager pinned in package.json. Run `pnpm verify`
before handoff. `pnpm pack:plugins` creates deterministic ZIPs and catalogs without
publishing or changing personal client configuration. The ordinary suite verifies
artifact contents, public client configuration, safe callback provisioning, actual
OAuth protocol flows with PGlite, and browser onboarding behavior.

When installed, Codex and Claude Code are also exercised against disposable local
catalogs with isolated CODEX_HOME / CLAUDE_CONFIG_DIR settings. CI without those CLIs
skips the corresponding two checks explicitly. Local catalog installation proves
package loading, not production OAuth, actual account access or directory publication.

## Live client acceptance

For both Codex and Claude Code, record client version, package version, distribution
source, test account and project IDs (not credentials), and the result of each check.
Use a fresh client configuration and install the actual published directory package.
Confirm the endpoint is `https://3dai.theoryfoundry.com/mcp`, the public client identity
matches the selected package, and the requested scopes are `cad:tools offline_access`.

Run these five positive scenarios for public review:

1. Install, connect an account and inspect an owned sample project's current state.
   Expect browser sign-in/consent and successful project tools without model edits.
2. Request a small, explicit change to the sample project. Validate and preview it
   with the matching signed-in browser tab visible. Promote only the valid candidate
   requested by the reviewer; confirm the resulting revision.
3. Export the approved sample revision as STL and verify the exported artifact.
4. Export that same revision as 3MF and verify format and revision consistency.
5. Continue after access-token expiry, then revoke access from TheoryFoundry Connected
   apps. Confirm refresh works before revocation, fails after it, and reconnecting
   requires authorization and restores access only for the selected account.

Run these three negative scenarios:

1. Request another account's project. Expect access denial without leaking its state.
2. Request promotion of an invalid or unvalidated candidate. Expect rejection and an
   unchanged current revision.
3. Request rendering with no matching visible browser tab. Expect the documented
   browser-required failure, then success after restoring the matching tab.

Also verify cancellation, install/update/reinstall without duplicate tool registrations,
manual fallback on localhost/other deployments, and coexistence with an older direct
connection. Remove only a confirmed duplicate configuration after the plugin works;
OAuth grant revocation remains an explicit account action.

## Publication gates

The first release requires public listings and a successful fresh installation in
both clients. Support/privacy/terms pages, publisher/domain verification, dedicated
review accounts, an actual review recording and directory approvals remain required.
Keep these outcomes distinct from schema checks, unit tests and production builds.
Record evidence in THE-44 without tokens, passwords, authorization codes or sensitive
logs. Publication does not enable signup or broaden account/project authorization.
