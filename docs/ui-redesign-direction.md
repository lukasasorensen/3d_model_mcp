# UI redesign direction

THE-36 records the design direction for the TheoryFoundry UI/UX redesign. The
[design concept](https://theoryfoundry-design-audit.khakicarol.chatgpt.site/)
and the initial source audit are starting points, not usability-test results or
final validated screens. The concept illustrates a populated project; the
state descriptions below are implementation targets to validate, not claims
that those screens already exist.

## Principles and visual system

- Give the model the largest uninterrupted surface. Use spacing and typography
  to organize the page; reserve borders and accents for meaningful grouping.
- Keep project identity, current and inspected revision, status, and the next
  action legible. Preserve actionable errors and progress in the main flow.
- Reveal source, identifiers, hashes, and history through named, keyboard
  accessible controls. Do not hide information needed to make an action safe.
- The selected concept palette is forest charcoal `#171f1c` for deep areas,
  workspace `#3b3d43`, charcoal `#575761` for supporting surfaces, white
  `#ffffff` for primary text, frosted mint `#e4fde1` for the model and restrained
  highlights, and sunflower gold `#ffbf46` for primary actions. THE-37 must
  define the actual semantic tokens, font, spacing scale, and interaction and
  status colors, with contrast checked in context. These swatches are not by
  themselves a complete accessible theme.
- Controls must communicate their role, state, and focus without relying only on
  color. Respect reduced motion, forced colors, zoom, and long names.

## Workspace layouts

On desktop, keep project navigation and connection access in the header. The
model and its immediate status occupy the main area; conversation, when enabled,
has a separate adjacent area. Keep dimensions and revision close to the viewer,
download prominent, and history and technical detail available on demand. The
viewer controls and interaction help remain discoverable and keyboard usable.

On small screens, the concept proposes direct Model, Conversation, and Details
navigation so each activity has usable space. Validate the exact control and
focus behavior before implementation. When chat is disabled, do not expose an
empty Conversation destination. Switching must preserve draft text, viewer
state, progress, and actionable feedback. The composer must be reachable
without scrolling past model details. Avoid hiding active errors or progress
when another section is selected.

## Representative state acceptance examples

These examples apply at desktop and mobile sizes, with chat both enabled and
disabled where relevant. They are design criteria for subsequent slices.

| State                         | Visible priority and expected behavior                                                                                                                                                                  |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Empty project                 | Name and empty model state explain the next available action. Download is unavailable with a reason; connection and conversation reflect enabled capabilities.                                          |
| Current model                 | Model, current revision, readiness, dimensions, and download are easy to find. Less frequent source and history details are disclosed on request.                                                       |
| Inspecting history            | Clearly distinguish the inspected revision from the current revision. Download identifies that it exports the current revision; restoring identifies the inspected revision and creates a new revision. |
| Render or restore in progress | Show meaningful progress and which operation is active. Preserve the existing restrictions on conflicting actions; do not rely on an ornamental progress line.                                          |
| Failure                       | Keep an understandable error and recovery action visible in context, including when a mobile section changes. Do not imply a failed export succeeded.                                                   |
| Download                      | Show format, the revision being exported, preparation and outcome. A successful receipt identifies the file; its verification hash remains available in a named disclosure.                             |
| Connection setup              | Present the immediate choice and next step clearly while retaining installation scope, security implications, prerequisites, and failure guidance.                                                      |

## Delivery and validation

THE-37 covers theme and typography, THE-38 shared controls, THE-39 progressive
disclosure and layout, THE-40 semantic interactions, and THE-41 cross-journey
verification. Implement in focused slices, beginning with the workspace, then
extend the language to project selection and connection setup. Keep feature flags,
revision semantics, export integrity, and existing capabilities intact.

Before treating THE-36 as complete, review representative desktop and mobile
designs for the states above, including chat variants and connection setup, with
real project content. The linked concept alone does not cover all those states.
Check keyboard navigation, focus, contrast, touch targets, long names, and
reduced motion. Record implementation checks separately from authenticated live
acceptance; neither the concept nor a passing build proves live acceptance.
