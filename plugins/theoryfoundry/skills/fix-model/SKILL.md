---
name: fix-model
description: Diagnose or make a targeted correction to a defective feature in an existing hosted TheoryFoundry model while preserving the rest of the project.
---

Use the hosted TheoryFoundry CAD tools bundled with this plugin. Find the intended
project by ID or URL, using `list_projects` if needed. Ask when the target is unclear.
A defect report about a selected project authorizes a targeted correction when
the intended behavior is clear. Honor explicit limits such as diagnosis only,
preview only, or no changes. Connection and selection alone leave the model untouched.

1. Identify the defect and the expected result. Ask for the intended dimension,
   tolerance, alignment, or a way to reproduce the problem when it matters to the
   correction. Inspect `get_project_state`, read the exact saved source with
   `read_model_source` or the relevant file/object tools, and inspect a baseline
   PNG via `get_model_preview` when the defect is visible. Explain the likely cause.
   For a diagnosis-only request, stop before proposing a change.
2. Make the smallest authorized change. Use `edit_parameters` for parameter edits
   and `edit_model_files` for targeted edits in a multi-file model. Use
   `propose_model_source` for a source correction when needed. Keep unrelated
   parameters, files, object identities, transforms, visibility, and composition.
   Propose against the exact current `parentRevision`. Retry the identical
   proposal with its original `requestId` and `toolCallId`.
3. Call `validate_and_render` with `previewProfile: standard`. On `BROWSER_REQUIRED`,
   focus or open the matching signed-in project tab visibly, or relay the returned
   project URL for the user to open. On `BROWSER_BUSY`, wait. Retry recoverable
   renderer failures on the same candidate. A rejected candidate requires a fresh
   corrected proposal. Keep the saved model intact while diagnosing failures.
4. For a `VALID` candidate, inspect its PNG by `candidateId`. Use the view that
   exposes the defect and compare with the baseline. Check the relevant dimensions
   or feature geometry as well. If the preview cannot be inspected, report the
   blocker and leave the saved revision intact. Promote only if the fix checks out
   and saving is authorized. Pass the original parent as `expectedParentRevision`.
5. On `STALE_REVISION`, inspect the latest state and compare the affected source
   with the base. If changes clearly concern different features, rebuild a targeted
   candidate on the latest parent and revalidate and inspect it. If they overlap
   or the impact is unclear, show the conflict and ask how to proceed.
6. Report the fix and the checks performed, the confirmed revision or candidate,
   and any unresolved verification. Fit, strength, and printability require
   evidence beyond a valid mesh. Export the confirmed saved revision if requested.

For “The hole in my Spacer project is off-center,” inspect its location
and center it if the intended center is clear. Preserve its diameter and use the
top view to verify the result. If another writer changes that hole’s diameter
before promotion, show the competing edit and preserve the newer revision while
waiting for direction.
