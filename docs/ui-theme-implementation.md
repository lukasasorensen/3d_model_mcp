# Theme and shared-control implementation

Initial implementation slice for THE-37 and THE-38, based on the approved
THE-36 prototype. This branch builds on the design draft PR; it does not merge
or deploy it.

## Changes

- Semantic theme tokens supply forest charcoal, gray workspace surfaces, teal
  primary actions, white text/model, and distinct success/error/warning colors.
- System sans typography replaces the condensed font stack. No remote font
  request is required. Spacing and control-radius tokens establish the shared
  scale; the model pane uses the new spacing.
- Shared control styles supply borderless buttons and fields, hover, disabled,
  and visible focus states. Authentication inputs now have explicit focus rules.
  Forced-colors mode restores system-colored boundaries, including for inputs.
- Primary buttons use #33888c with #07110e text (4.60:1). Focus uses #66b8bc;
  smaller accent text uses a lighter #83c9cc to remain readable on raised surfaces.
- Restore actions fit their content rather than spanning the entire history row.
- Connection setup inherits the shared surfaces and text colors.

## Delivery boundary

This is the visual foundation, not the full workspace redesign. Mobile section
navigation, restructured workspace details, project-list disclosure, and guided
setup sequencing remain subsequent slices. Public protocols, revision/export
semantics, feature flags, and persistence are unchanged.

Automated verification does not establish authenticated workspace acceptance.
Review real project states, keyboard focus, responsive layout, forced colors,
and device zoom as implementation proceeds under THE-41.
