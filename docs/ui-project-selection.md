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

Run `pnpm test:browser projectLanding.component` with the pinned Node
version and Playwright Chromium installed. It renders the actual component with
sample projects and stubbed routing/authentication and creation responses.

Checks cover 1440/390/320px overflow, link destinations, keyboard disclosure,
create/cancel focus, draft preservation, pending/error states, and an empty list.
Desktop and phone screenshots were visually inspected. This local check does not
establish authenticated live project creation or deployment acceptance.

## Creation and account journeys

Additional desktop (1440px) and phone (390px) tests use the actual authentication
client and intercepted HTTP responses. They verify native required-field blocking,
trimmed creation payloads, retained drafts after failed or malformed responses,
keyboard submission, and navigation only after successful creation.

Sign-out tests cover server errors, network failure, pending controls, and retry.
They exposed navigation to sign-in despite a failed sign-out response. The page
now checks the client result, shows a retryable alert on failure, and disables
conflicting form actions while signing out. Successful sign-out replaces the
route and refreshes it. Both viewport tests failed before the fix and pass after.

Routing remains a recorded fixture; HTTP never reaches a real service. These
checks do not prove session-cookie revocation or authenticated database creation.
