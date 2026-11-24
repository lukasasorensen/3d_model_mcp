---
name: create-model
description: Build a new 3D design in hosted TheoryFoundry from a written brief or dimensions, then validate, preview, and deliver it.
---

Use the hosted TheoryFoundry CAD tools bundled with this plugin. For connection
or account trouble, use `connect-theoryfoundry`. Use `create-model-from-drawing`
when a drawing or image is the primary source, and `plan-model` for planning alone.

1. Establish the intended geometry, units, and deliverable. Ask for missing
   dimensions, tolerances, or interfaces when they determine fit or function.
   State any assumptions used for the remaining details.
2. Resolve the target project by ID or URL. A standalone request to build a new
   design with no existing project indicated authorizes `create_project`. Choose
   a concise name and description from the brief. For preview only, ask before
   creating a project. If the request refers to an existing project, use
   `list_projects` if needed and ask if the target is ambiguous. Call
   `get_project_state`, then `read_model_source` at the current revision if one
   exists. Clarify whether to add to or replace an existing model when the request
   leaves that open. Preserve unrelated model data and settings.
3. Use `propose_model_source` with that `parentRevision` (`null` for an empty
   project). Select the source representation supported by the current project
   and use targeted file or parameter tools when adding to an existing model.
   Reuse the same `requestId` and `toolCallId` when retrying the same proposal.
4. Run `validate_and_render` with `previewProfile: standard`. For `BROWSER_REQUIRED`,
   open or focus the matching signed-in project tab visibly, or give the user
   the returned project URL if the client cannot do so. For `BROWSER_BUSY`, wait
   for the renderer. Retry a recoverable render failure on the same candidate.
   For a rejected model, correct the source and validate a new candidate.
5. For a `VALID` candidate, inspect its PNG via `get_model_preview` using its
   `candidateId`. Compare the shape and available geometry bounds with the brief.
   If the client cannot inspect the PNG, stop before promotion and report the
   blocker. For a preview-only request, show the candidate and stop there. Save
   an authorized result with `promote_candidate` using the same parent as
   `expectedParentRevision`. On `STALE_REVISION`, reread the current state and
   compare the source with the base. For clearly unrelated changes, rebuild
   against the latest parent, preserve the intervening change, and validate and
   inspect the new candidate. Explain overlapping or uncertain changes and ask
   how to proceed.
6. Deliver the project link, confirmed revision or candidate, and preview as
   available. If asked for STL or 3MF, use `export_model` on the confirmed saved
   revision. If retrieving the file, verify its byte count and hash against the
   receipt. Otherwise deliver the expiring download link as such. Report which
   dimensions you checked. Geometry validation covers the rendered mesh. Claims
   about fit, strength, or printability need separate evidence.

For “Make a 30 × 20 × 4 mm solid spacer and export it as STL,” create a
Spacer project if the request is standalone. Inspect its state, validate the
candidate, and compare its bounds and PNG to the brief. Save the candidate and
export the returned revision.
