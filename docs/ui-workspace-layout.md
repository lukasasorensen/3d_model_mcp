# Workspace layout implementation

THE-39 continues the approved direction with a focused workspace slice:

- Download format and the primary download action precede history and source.
  The button identifies both format and current revision while inspecting history.
- Revision, dimensions, and preview status remain beside the viewer. Redundant
  preview technology text, decorative header copy, and boxed facts are removed.
- Revision history and Model source remain independent native disclosures below
  the download outcome. Source still loads only when its disclosure is opened.
- Header controls wrap on phones, long project names are constrained, and facts
  wrap without truncating dimensions. Existing operation restrictions and feedback
  are preserved.

## Validation boundary

Local Chromium review renders the actual workspace, chat, history, and source
components with sample hook state and a placeholder viewer. Empty and historical
inspection layouts were checked at 1440 × 900, 390 × 844, and 320 × 740, including
a long project name, disclosure activation, and horizontal overflow. This does
not validate authenticated CAD operations or WebGL rendering.

This slice retains the stacked mobile workspace. Dedicated Model, Conversation,
and Details navigation, draft/focus preservation across those views, real project
acceptance, and the broader accessibility review remain subsequent work. The
existing desktop chat collapse behavior is preserved.
