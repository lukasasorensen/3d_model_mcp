# Redesign review

Reviewed the current draft and prototype after changing model material to white.
White with neutral gray shading keeps the model distinct from the forest
charcoal canvas. The actual viewer now uses white material as well; its final
appearance under lighting still needs authenticated WebGL review.

## Findings before implementation

- Mobile project navigation is missing. The responsive stylesheet hides both
  the project name and All projects without providing a replacement. Add a
  reachable project menu or navigation link on small screens.
- Empty-state content is inconsistent. The scenario hides the model and disables
  download, but static history still lists R3 and R2 and conversation says the
  model is ready. Supply coherent history, conversation, viewer controls, and
  readiness for an empty project before validating that journey.
- Export state is inconsistent with format selection. Preparation and receipt
  text are hardcoded to STL even when GLB or 3MF is selected. Derive all export
  labels and sample filenames from the selected format and model the format
  control's busy state.

These are prototype design gaps, not claims that the production application has
the same defects. The inert CAD controls are explicitly documented; their lack
of real rendering, restore, or download behavior is intentional at this stage.

## Assessment

The broad hierarchy is promising: the canvas dominates, technical information
has a predictable home, and current versus inspected revision is explicit.
The mobile sections preserve drafts and keep operation notices outside the
selected panel. Setup still places compute, client, and scope choices together;
review its density on small screens before committing to two steps.

The study should remain a draft. It lacks real project content, long-name and
zoom coverage, complete keyboard and assistive-technology review, measured
contrast evidence, and authenticated viewer acceptance. The white material
change does not affect source geometry or exported artifact formats.
