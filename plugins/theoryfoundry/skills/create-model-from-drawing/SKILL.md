---
name: create-model-from-drawing
description: Build a hosted TheoryFoundry model from a drawing, sketch, or reference image. Check the views and dimensions, and resolve ambiguity before modeling for fit.
---

Use the supplied drawing or image as design evidence. If the client cannot open
it or a relevant view is illegible, ask for a clearer view or transcribed dimensions.
Use `plan-model` for an interpretation or plan without implementation.

1. Identify the relevant views, units, reference surfaces, dimensions, hole
   centers and diameters, thicknesses, and tolerances. Prefer labeled values over
   proportions. Distinguish explicit dimensions from deductions and estimates.
   Use image measurements only as estimates when a reliable scale and view support
   them. Ask about contradictory callouts, obscured features, and missing measures
   that govern fit. If useful, offer a visual approximation, label its assumptions,
   and build it only when the user authorizes that approximation.
2. Use the bundled hosted CAD tools. A standalone build request that indicates
   no existing project authorizes `create_project`. For preview only, ask before
   creating a project. For an existing project, use `list_projects` if needed to
   resolve its ID or URL and ask if the target is ambiguous. Inspect the current
   state and source, if present.
   Preserve unrelated geometry and settings. Propose the model or targeted edits
   against the exact current parent (`null` for an empty project). Retry an
   identical proposal with the same IDs.
3. Validate with `validate_and_render` using `previewProfile: standard`. On
   `BROWSER_REQUIRED`, open or focus the matching visible signed-in project tab,
   or give the user the returned project URL. Wait on `BROWSER_BUSY`. Retry a
   recoverable renderer failure on the same candidate and use a new proposal for
   source corrections after model rejection.
4. For a `VALID` candidate, use `get_model_preview` with its `candidateId` and the
   views that match the drawing. Compare the inspected PNGs and available geometry
   measurements with the documented features. If preview inspection is blocked,
   report it and stop before saving. Save only within the authorized scope using
   `promote_candidate` with the proposal’s parent as `expectedParentRevision`.
   For preview only, stop at the candidate. On `STALE_REVISION`, reread the latest
   state and compare the source with the base. For clearly unrelated changes,
   rebuild against the latest parent, preserve the intervening change, and validate
   and inspect the new candidate. Explain overlapping or uncertain changes and ask
   how to proceed.
5. Deliver the confirmed revision or preview candidate and report which features
   match the drawing, which were estimated, and what still needs verification.
   Export the confirmed saved revision if requested. Fit, strength, and
   printability require additional evidence.

If a 60 × 40 mm mounting plate drawing specifies 4 mm thickness and two Ø5 mm
holes symmetric about the centerline, ask for the center-to-center spacing if
it is missing and the plate needs to fit. Once supplied, use a top view to check
the hole layout and a side view to check thickness. Report the checked dimensions
and any remaining assumptions.
