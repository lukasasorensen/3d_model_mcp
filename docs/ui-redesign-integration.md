# Redesign integration verification

PRs #36 (project selection), #37 (connection setup), and #38 (workspace
accessibility) were reviewed and merged into `develop` after their exact heads
passed CI. Combined baseline: `2a40bc966ec8350c4006d58e855076675c819916`.
No production deployment or merge into `master` occurred.

## Browser verification

Run with Node 24.21.0 from the repository root:

```sh
node tooling/ui-redesign/focusAcceptance.script.mjs
node tooling/ui-redesign/viewerAcceptance.script.mjs
node tooling/ui-redesign/composerFocusAcceptance.script.mjs
node tooling/ui-redesign/projectAcceptance.script.mjs
node tooling/ui-redesign/setupAcceptance.script.mjs
```

All five Chromium suites passed against the combined tree. They cover project
selection and create-form failure/pending states, six connection-command variants,
clipboard fallback, native dialog dismissal, mobile navigation, focus recovery,
forced colors, reduced motion, and a real WebGL viewer initialized while hidden.

The workspace suite now enables the actual connection dialog inside the actual
workspace component. At 1440, 390 and 320px it verifies project-specific starter
text, dialog Escape focus restoration, no horizontal overflow, and conversation
draft retention across setup and mobile section changes. The shared application
stylesheets are loaded together. No integration defect was found in these checks.

## Repository verification

`pnpm verify` passed on Node 24.21.0: formatting, conventions, architecture,
lint, types, tests and the production build. Three existing optional tests remain
skipped: the disabled performance budget and two provisioned-database tests.
The expanded browser script and this report also passed focused lint, formatting
and convention checks.

## Acceptance boundary

Browser suites use fixture data and stub service/router boundaries. They do not
prove authenticated project creation, actual CAD revision restoration/downloads,
installer execution, or client authorization. The viewer suite uses an in-memory
STL, not a real CAD engine request. Screen-reader and native-device acceptance
remain separate. THE-41 stays In Progress until remaining acceptance is resolved.
