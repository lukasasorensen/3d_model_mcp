# Connected-apps redesign

Connected apps now uses the shared borderless controls and neutral surfaces, with
responsive rows for long app names, a clear connection action and a projects link.
Each revoke button names its app for keyboard and assistive-technology users.
Pending revocation disables other revoke actions and identifies the active row.

A failed request retains the grant and displays a retryable error. Only a successful
DELETE response hides the grant locally and triggers the server refresh. A live
status announces which app lost access; focus moves to the page heading before
the focused row disappears. The existing warning about in-progress operations and
all server authorization boundaries are unchanged.

## Verification

`pnpm test:browser connectedApps.component` exercises actual components/styles
at 1440, 390 and 320px. It covers long-name overflow, keyboard activation,
app-specific accessible names, encoded DELETE destinations, failure and retry,
pending controls, successful removal/status/focus, setup dialog dismissal,
empty state, and the projects link. The tests retain layout screenshots in their
ignored Playwright output folders for visual review.

HTTP responses and router refresh are fixtures. This verifies frontend behavior,
not live OAuth revocation, authenticated sessions, screen-reader announcements,
or native-device behavior. Those remain separate acceptance work under THE-41.

Desktop and 320px screenshots were reviewed. Full verification also exposed a
race in the pre-existing workspace focus test: it targeted the next control before
the preceding section's animation-frame focus restoration completed. That test now
waits for the frame before sending keyboard input; ten repeated runs passed.
