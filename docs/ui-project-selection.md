# Project-selection redesign

This THE-39/THE-40 slice extends the approved theme to the project library.
Project names and opening a project are primary; descriptions and identifiers
live in native Project details disclosures. Navigation uses links, preserving
keyboard activation and browser new-tab behavior. Account actions remain visible.

The create form has an explicit heading, pending field states, and a Cancel action
that restores focus to New project. Closing and reopening retains the draft;
failed creation preserves values and displays an alert. Existing required fields,
API payloads, authentication, and ownership checks are unchanged.

Project styles are separated from authentication styles. The layout wraps long
project/account names and adapts at phone widths without routine control borders.

## Verification

Run `node tooling/ui-redesign/projectAcceptance.script.mjs` with the pinned Node
version and Playwright Chromium installed. It renders the actual component with
sample projects and stubbed routing/authentication and creation responses.

Checks cover 1440/390/320px overflow, link destinations, keyboard disclosure,
create/cancel focus, draft preservation, pending/error states, and an empty list.
Desktop and phone screenshots were visually inspected. This local check does not
establish authenticated live project creation or deployment acceptance.
