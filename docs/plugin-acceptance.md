# Hosted plugin verification

Use Node 24.21.0 and the package manager pinned in package.json. Run `pnpm verify`
before handoff. `pnpm pack:plugins` creates deterministic ZIPs and catalogs without
publishing or changing personal client configuration. The ordinary suite verifies
artifact contents, public client configuration, safe callback provisioning, actual
OAuth protocol flows with PGlite, and browser onboarding behavior.

When installed, Codex and Claude Code are also exercised against disposable local
catalogs with isolated `CODEX_HOME` and `CLAUDE_CONFIG_DIR` settings. The clients
must discover the setup skill and all four modeling skills. CI skips each check
when its CLI is absent. This check ends at installation and skill discovery.

## Hosted modeling skill acceptance

Use a freshly installed candidate in each client. Follow the
[candidate installation instructions](../plugins/theoryfoundry/README.md), sign
in to a test account, and authorize the bundled hosted MCP connection. Use only
disposable projects. Keep the matching signed-in project tab visible for renders.
Run each case with the named skill. Repeat an example prompt in a fresh session
without the explicit skill name to assess automatic selection.

1. **Create and export.** Ask for a 30 × 20 × 4 mm solid spacer and an STL.
   Expect one new project for the standalone request, then a preview and a saved
   revision with the requested bounds. Check the export's revision, byte count,
   and file hash against its receipt. In a fresh session, ask for a preview only
   and expect a question before project creation. Name the spacer project and
   check that the candidate preview leaves its saved revision intact.
2. **Fix and handle a conflict.** Seed a plate with a single Ø5 mm hole at an
   off-center position. Report that the hole in the named project is off-center.
   Expect a targeted correction that preserves diameter and other geometry. For
   the conflict case, request the corrected candidate and ask the agent to wait
   after showing the preview. Change the same hole's diameter through the project
   editor and save. Resume the original request. Expect conflict detection, an
   explanation of the overlapping change, and preservation of the newer revision
   while the agent waits for direction. Repeat with a clearly independent fillet
   edit and expect a new candidate against the latest parent that preserves it.
   For renderer recovery, start with the tab hidden, then make it visible and
   check that the agent retries the same candidate.
3. **Plan only.** Ask for a plan to add mounting holes to a named project. Expect
   an approach, dimensions or questions, and a verification plan. Check the tool
   trace for read-only calls and confirm the current revision is unchanged.
4. **Drawing with a missing dimension.** Attach the
   [mounting plate drawing](mounting-plate-drawing.svg) as a PNG if the client
   requires it. Ask for a mounting plate that will fit the existing hardware.
   Expect a question about center-to-center hole spacing before any proposal.
   Reply with 32 mm. Expect top and side views, a report of the checked features,
   and the confirmed revision. The drawing also works as an explicit visual-only
   approximation case. Check that guessed dimensions and the lack of a test fit
   are clear in the result.

For each client, record the client and candidate versions, project IDs, scenarios
run, observed tool order, and confirmed revision or artifact metadata. Keep
bearer links and credentials out of the report. Record installed-agent results
separately from archive checks, discovery, and public directory acceptance.

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
