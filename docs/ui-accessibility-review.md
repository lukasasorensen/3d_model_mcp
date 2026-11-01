# Redesign accessibility review

THE-40/THE-41 review covers the workspace on develop plus separate snapshots of
project selection (PR #36, `8d20f5e`) and connection setup (PR #37, `119433f`).
The draft screens were checked independently, not merged into a deployed app.

## Fixed in this slice

- Request completion previously always attempted to focus the composer. It now
  restores focus only when the composer is visible, enabled, and no other control
  owns focus. Moving to another control while work runs keeps that focus.
- The project selector has an explicit label independent of option text.
- Each history restore button names the revision it restores while retaining the
  visible “Restore as a new revision” explanation.

## Verification

The actual completion-focus hook is exercised by
`node tooling/ui-redesign/composerFocusAcceptance.script.mjs`. It covers default
focus restoration, another focused control, a hidden composer, and restore-action
names. `focusAcceptance.script.mjs` checks the selector name, recovery/resize focus,
forced-color selection outlines, and reduced-motion transition behavior.

The project and setup acceptance scripts also passed against isolated snapshots
with Chromium forced colors and reduced motion enabled. Their existing keyboard,
form/disclosure, error, command-variant, and 320px overflow checks remain green.
This verifies behavior under those modes, not an exhaustive visual or screen-reader
assessment. No installer commands were executed.

Calculated palette contrast ratios against workspace `#3b3d43`: white text 10.86:1,
muted text 7.46:1, focus teal 4.73:1, and accent text 5.79:1. Dark primary-button
labels against `#33888c` are 4.60:1. These are token-pair calculations, not a claim
that every rendered control and interaction state has been audited.

## Remaining acceptance

Review the combined changes after integration, real authenticated project flows,
screen-reader announcements, native device zoom/keyboard behavior, and actual
CAD restore/export operations. Keep these separate from local fixture checks and
build success. THE-40 and THE-41 remain in progress.
