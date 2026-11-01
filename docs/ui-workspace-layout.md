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

## Mobile sections

Below 1024px, native buttons switch between Model, Conversation (when enabled),
and Details. Selected buttons expose their pressed state and controlled panel;
keyboard focus stays on the selected control. CSS hides inactive panels without
unmounting the viewer, composer, or disclosures. Desktop keeps its adjacent panes
and collapse control; a collapsed desktop conversation is expanded on mobile.

Progress, export failures and receipts remain outside the switched panels.
Preview and request failures provide a route to the relevant mobile section.
The skip link selects Model before moving to its focusable heading.

Local Chromium interaction checks passed for draft retention, mounted-viewer
retention, Enter activation, disclosures, resizing from collapsed desktop chat,
chat-disabled navigation, export-error visibility across sections, and no
horizontal overflow at 320, 390, and 768px. These checks use sample state and a
placeholder viewer; real WebGL camera retention, authenticated CAD acceptance,
and the broader assistive-technology review remain outstanding.
