# Redesign accessibility review

THE-40/THE-41 cover the integrated workspace, project library, connection setup,
connected apps, sign-in and authorization screens. Code verification is separate
from authenticated live and assistive-technology acceptance.

## Automated browser coverage

`pnpm test:browser` runs the same 20 journey tests plus a media-preference check in two projects:

- `chromium`: normal rendering.
- `chromium-accessibility`: forced colors active and reduced motion requested.

Both projects run in `pnpm verify` and CI (42 test executions). A dedicated
check asserts the actual `matchMedia` values, so unsupported or misplaced
configuration cannot silently disable the requested modes. Use
`pnpm test:browser --project=chromium-accessibility` for the alternate mode alone,
or combine a project flag with a filename filter. Reports and failure artifacts
identify the project, so failures remain distinguishable.

Coverage includes responsive layout, long names, named actions, keyboard
activation, native disclosures, form errors/retries, pending states, setup choices,
dialog dismissal, revision inspection/restoration, source validation and downloads.
The workspace checks explicitly assert a visible selected-section outline under
forced colors and disabled transitions under reduced motion.

Connection setup additionally traverses Tab and Shift+Tab through the native
modal. The check ensures background page controls stay unreachable and both Close
and Continue are reached. It permits native browser focus outside the document;
it does not replace native dialog behavior with a custom focus trap.

## Implemented focus and naming behavior

- Request completion restores composer focus only when it is visible, enabled,
  and another control has not claimed focus.
- Mobile section changes and resizing restore focus to a visible destination.
- The project selector and revision restore actions have explicit names.
- Cancelling project creation restores focus and preserves the draft.
- Connection steps focus their headings; closing returns focus to the trigger.
- Revocation identifies its app, announces success and moves focus before removing
  the confirmed row. Failed revocation keeps the row available for retry.

## Contrast and visual review

Calculated token ratios against workspace `#3b3d43`: white text 10.86:1,
muted text 7.46:1, focus teal 4.73:1, and accent text 5.79:1. Dark primary-button
labels against `#33888c` are 4.60:1. These are token-pair calculations, not a claim
that every rendered control and interaction state has been audited.

Desktop and phone layouts were reviewed during their implementation slices.
The alternate-mode test project verifies interactions and existing layout
assertions; it is not a screenshot-diff suite or an exhaustive contrast audit.

## Remaining acceptance

- Real authenticated project creation, CAD restore/export and OAuth/client flows.
- Screen-reader announcements and reading order with actual assistive technology.
- Native-device keyboard, touch and zoom/reflow behavior.

Browser services use fixtures and Chromium media emulation. This does not establish
live acceptance, native high-contrast behavior on every platform, or WCAG
conformance. THE-40 and THE-41 remain In Progress. No deployment is implied.
