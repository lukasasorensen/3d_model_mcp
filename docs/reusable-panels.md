# Reusable editing panels

THE-74 fixes the 0.17.0 desktop overlap between Edit objects and Parameters.
Both previously inherited a feature class that assigned the same explicit grid
cell. Layout and panel appearance now have separate owners.

## Composition API

Import from `apps/site/src/shared/panels/index.ts` through its public barrel.
The primitives are browser-safe and have no feature, service or server dependencies.

| Component      | Contract                                                                                                                 |
| -------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `PanelLayout`  | Required `main` and `panels` React nodes; owns responsive positioning.                                                   |
| `PanelStack`   | Required `children`; lays out any number of panels in normal flow.                                                       |
| `Panel`        | Required `title` string and `children`; optional `description`, `actions`, `busy`, `dirty`, `error` and `errorFocusRef`. |
| `PanelActions` | Required `children`; shared wrapping action row, including inside a form.                                                |

`error` accepts an error object or message; its changed identity/value represents
a new failure. Clear it when starting a retry. `errorFocusRef` points to the
feature-owned focusable error summary. The panel reveals its body in the failure
commit, then focuses that summary. Error handling and announcements stay in the
feature. Header indicators are descriptive text, not duplicate live regions.

```tsx
<PanelLayout
  main={<ModelPreview />}
  panels={
    <PanelStack>
      <Panel
        title="Measurements"
        description={<p>Inspect the accepted model dimensions.</p>}
        busy={pending}
        dirty={dirty}
        error={error}
        errorFocusRef={summaryRef}
      >
        {error && (
          <div ref={summaryRef} tabIndex={-1} role="alert">
            {error.message}
          </div>
        )}
        <MeasurementFields />
        <PanelActions>
          <button type="button">Apply measurements</button>
        </PanelActions>
      </Panel>
    </PanelStack>
  }
/>
```

Use the `actions` slot for a footer outside a form, or `PanelActions` inside the
feature's form to preserve submit behavior. Feature code owns validation,
requests, drafts, pending locks, retries, and the lifecycle of its resources.
Do not use shared panel classes to position individual features. Adding a panel
requires no grid coordinates, row spans, feature selectors, or layout registration.

## Layout and disclosure

The shared stylesheet is `apps/site/src/app/styles/panels.css`. A named inline-size
container switches at 960px of available width: flexible main content, a 16px gap,
and a 320px inspector column. Smaller containers stack the inspector after the
main content. This responds to chat taking space, independent of viewport width
or whether parameters exist. Unsupported container-query browsers retain stacking.
All panels use normal document flow and the existing workspace scrolling surface;
there are no panel height caps or independent scrollbars.

The combined editor places the shared Layers and Parameters panels over or
below its viewport at the thresholds in [Object layers](object-layers.md).
Pass a `floating` configuration with the workspace toolbar element, title icon,
and optional `initiallyOpen` and `tuckLeft` settings. The disclosure button renders in that toolbar.
The close button and Escape return focus there. The Layers list scrolls for long models.
Default shared
panels start expanded. Native buttons
support pointer, Enter, Space, and normal Tab navigation with unique accessible
names/IDs. Collapsed bodies remain mounted but are hidden and inert, preserving
drafts, object history and in-flight work. Headers remain operable while busy and
show unsaved, working and error indicators. A new error expands the affected panel
before focusing its summary; users can collapse an existing error again.
The workspace's project key resets disclosure state when switching projects.

## Verification and release

Browser tests cover combined populated panels, pairwise non-overlap, long labels,
960px container boundary, desktop/mobile widths, chat modes, enlarged text,
empty/loading/error data, retained drafts and operation locks. Shared-component
coverage includes a fourth panel, keyboard behavior, IDs, pending state and error
focus. Playwright runs these in normal Chromium and forced colors/reduced motion.
Existing feature tests continue to cover save, cancel, undo/redo and retry behavior.

Versions relative to develop: root/hosted/local plugins 0.17.0 → 0.17.1;
site 0.15.0 → 0.15.1. Other packages and renderer pins are unchanged. No new
migration, public protocol, dependency or setup requirement. Existing deployment
requirements still apply. Local fixture checks do not establish authenticated
production acceptance; merge, deployment and live acceptance are separate gates.
