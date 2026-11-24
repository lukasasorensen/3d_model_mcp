---
name: plan-model
description: Develop a read-only TheoryFoundry CAD plan for a proposed design or revision, including dimensions, tradeoffs, and verification steps.
---

Use when the requested deliverable is a plan, feasibility assessment, or design
comparison. A brief or drawing can be enough. When the plan depends on an existing
hosted project, resolve its ID or URL using the bundled TheoryFoundry CAD tools.
Read the project state, relevant source, or existing preview as needed. Keep this
workflow read-only. Project creation, candidate proposals, validation, promotion,
and exports belong to a separately authorized modeling request.

- Establish function, required interfaces, units, and the desired deliverable.
  Separate dimensions supplied by the user or source from estimates and unknowns.
  Ask about missing fit-critical measurements or make the plan conditional on them.
- Propose a modeling sequence that names the important features, reference surfaces,
  and adjustable dimensions. For an existing design, identify which features need
  to change and which relationships need to be preserved. Compare alternatives only
  when they change something the user cares about, such as fit or adjustability.
- State what would count as success. Identify views and dimensions to check and any
  test fit or print verification the intended use requires. Treat render validation
  as a geometry check.

For “Plan a wall bracket for this shelf,” identify the load and mounting
constraints that affect the design. Ask for the hole spacing and screw dimensions
if missing. Describe the base plate, fastener clearance, and how to verify them.
Return the plan in the conversation.
