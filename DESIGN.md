# Design

## Source of truth

- **Status:** Active for G005, with assumptions and checkpoint-sensitive items called out below.
- **Last refreshed:** 2026-08-05.
- **Primary product surfaces:** The local Next.js workspace at `/`; the left model-inspection pane; the right conversational CAD pane; revision/history controls; validated artifact export; responsive stacked presentation below desktop width.
- **Decision contract:** This file is the canonical UI/UX and frontend design contract for G005. The PRD remains authoritative for product scope, security, architecture, and acceptance criteria; the shared contracts remain authoritative for runtime states and event meanings. If implementation evidence conflicts with this document, preserve the PRD and typed contracts, then update this document before inventing UI behavior.
- **Architecture checkpoint discipline:** This contract applies the requested Next.js/React, Three.js/R3F viewer, STL preview, 3MF export, and local-first architecture. It does not itself approve a new framework, viewer, persistence model, provider, deployment topology, credential flow, or user-visible scope. Any such departure must return to the applicable architecture checkpoint.
- **Evidence reviewed:**
  - `.omx/specs/deep-interview-3d-model-ai-chat.md` — binding intent, scope, non-goals, split workspace, canonical journey, and architecture-checkpoint rule.
  - `.omx/plans/prd-3d-model-ai-chat.md` — RJLS positioning, last-known-valid invariant, proposed R3F/Three viewer, viewer controls, artifact limits, revision semantics, and AC-03/AC-09.
  - `.omx/plans/test-spec-3d-model-ai-chat.md` — UI race, disposal, accessibility, responsive, artifact-validation, performance, and end-to-end expectations.
  - `.omx/ultragoal/goals.json` and `.omx/ultragoal/brief.md` — G005 objective and the later G006 canonical-journey verification boundary; reviewed read-only.
  - `README.md` — current local-first product and credential-free mock-provider framing.
  - `package.json`, `apps/site/package.json`, `apps/site/src/app/layout.tsx`, `apps/site/src/app/page.tsx`, `apps/site/src/app/styles.css`, and `apps/site/src/foundation.test.mjs` — current Next.js 15/React 18 shell, global CSS approach, dark foundation, teal accent, and browser-safe contract use.
  - `apps/site/src/app/v1/chat/route.ts`, `packages/contracts/src/index.ts`, and `packages/gateway/src/orchestrator.ts` — strict request shape and authoritative assistant, tool, candidate, revision, artifact, error, and done events.
  - Git history and asset scan — one initial commit; no existing logo, illustration, font, screenshot, Storybook story, or visual-regression baseline was found. The current application UI is a temporary centered placeholder.
- **Observed facts vs design decisions:** File paths, contracts, limits, current dependencies, and acceptance criteria above are observed. The visual system, component composition, breakpoint behavior, keyboard model, and content rules below are design decisions for G005. Items explicitly labeled **Assumption** remain revisable without weakening the binding product contract.

## Brand

- **Product name in UI:** Use **RJLS Conversational CAD** as the human-facing name. Keep `3d_model_mcp` for package identity, diagnostics, and metadata where needed; do not make the repository slug the primary wordmark.
- **Personality:** Precise, capable, calm, and visibly engineered. The product should feel like a compact instrument bench where every state is inspectable, not a magical black box and not a neon science-fiction cockpit.
- **Aesthetic direction:** **Precision workshop.** A dark graphite workspace, warm technical text, mint verification signals, and amber current-revision accents support long viewing sessions and make state changes legible. Fine grid, calibration ticks, and measured labels provide CAD specificity without pretending to offer sketching or direct geometry editing.
- **Memorable device:** A continuous **revision rail** visually connects the current-revision badge in the viewer with the matching promoted step in chat/history. The rail changes only on an authoritative `candidate_promoted` or `current` event, making trust and continuity the distinctive interaction rather than decorative spectacle.
- **RJLS positioning:** The headline promise is reliable conversational CAD. MCP, LangChain, OpenSCAD, and BOSL2 may appear in a restrained system-details area or activity disclosure, but the user-visible lead is creating and refining a functional part through conversation.
- **Trust signals:** Current revision ID; explicit millimeter units; validated preview/export status; visible tool progress; honest recovery copy; immutable history; artifact format and size; an always-visible distinction between “preview validated” and any unsupported engineering claim.
- **Avoid:** Purple/blue AI gradients; chat-bubble-first landing pages; glowing robots or sparkle icons; fake dimensions; fabricated success; “production ready,” “engineering validated,” “safe to manufacture,” or equivalent claims; dense IDE chrome; direct-manipulation affordances such as transform gizmos, selection handles, face highlights, or cursors that imply geometry editing.

## Product goals

- **Goals:**
  - Make the blank → create → edit → edit → export journey immediately understandable and demonstrable.
  - Keep the inspected model and its authoritative revision legible throughout chat activity.
  - Make tool work observable without forcing users to understand MCP method names.
  - Preserve the last-known-valid model during rendering, repair, cancellation, stale responses, and failure.
  - Make history, restore-as-new-revision, and export discoverable but secondary to the conversation.
  - Present RJLS as capable of building trustworthy AI tool workflows, with implementation detail available on demand.
- **Non-goals:**
  - General CAD, sketching, constraints, assemblies, simulation, arbitrary mesh import/repair, sculpting, or direct manipulation.
  - Engineering certification, structural validation, manufacturability guarantees, or guaranteed tolerances.
  - Accounts, sharing, collaboration, cloud sync, public deployment, or live-provider selection.
  - Exposing raw OpenSCAD source, filesystem paths, provider prompts, credentials, internal stack traces, or container commands in the default UI.
- **Success signals:**
  - A first-time user can identify the model pane, conversation pane, current revision, and primary prompt within five seconds.
  - The canonical R1/R2/R3 progression reads as one project history, never as disconnected generated files.
  - Users can tell whether the system is thinking, using a tool, validating, promoting, complete, recoverably failed, or cancelled.
  - A failed candidate never visually replaces the current valid model.
  - The final 3MF export is explicitly tied to the displayed revision.
  - All required controls and state messages are usable with keyboard and screen reader at desktop and narrow layouts.

## Personas and jobs

- **Primary personas:**
  - **Prospective RJLS client or technical stakeholder:** evaluates whether RJLS can deliver a credible, bounded agentic workflow rather than a scripted chat demo.
  - **Maker or product engineer familiar with dimensions:** wants to describe a simple functional part, refine dimensions/features, inspect the result, and export it without hand-authoring OpenSCAD.
  - **Demo operator/developer:** needs a deterministic, credential-free local path whose stages and failures remain legible during a presentation.
- **User jobs:**
  - Turn a dimensional request into a viewable functional part from a blank project.
  - Change an existing part while preserving continuity and revision history.
  - Understand what the agent is doing and whether a change became authoritative.
  - Inspect geometry by orbiting, panning, zooming, fitting, and resetting the camera.
  - Recover from a rejected change or restore a prior revision without silently rewinding history.
  - Export the exact current revision as a fabrication-oriented 3MF artifact.
- **Key contexts of use:** Desktop/laptop local demo is primary; narrow laptop, tablet, and phone are supported for review and conversation. The experience may run without live-provider credentials and may encounter a slow or unavailable local renderer. Users may not know OpenSCAD, MCP, or revision terminology.

## Information architecture

- **Primary navigation:** There is one workspace, not a marketing site plus application. A compact top bar contains the RJLS mark/title, project state, and a restrained system-status disclosure. It must not consume meaningful vertical space.
- **Core routes/screens:**
  - `/` — the single conversational CAD workspace.
  - `/v1/chat` — server route only, never presented as navigable UI.
  - Planned opaque artifact route — download/preview transport only, not a browseable gallery.
- **Desktop content hierarchy:**
  1. App bar: product identity, local/demo status, current-project status.
  2. Left workspace (about 62%): viewer canvas, current revision, model facts, camera controls, non-blocking render/error overlay.
  3. Right workspace (about 38%): conversation, grouped tool activity, composer.
  4. Secondary surfaces: revision history and export actions, anchored to the current revision rather than detached global actions.
- **Narrow content hierarchy:** Viewer first, then current-revision summary, then conversation and sticky composer. History becomes an in-flow disclosure or sheet; export remains adjacent to the current revision. Preserve the same DOM/focus order as desktop.
- **Canonical journey:**
  1. Blank workspace offers one clear canonical starter plus a small number of example prompts.
  2. The submitted request appears immediately; progress groups under the assistant turn.
  3. Candidate and validation steps update the activity, while the viewer retains the prior valid model.
  4. Promotion advances the revision rail and swaps the validated preview atomically.
  5. Two later prompts operate against the visible current revision.
  6. Export exposes a 3MF download tied to the current revision and confirms format, units, and size.
- **Assumption:** G005 is a single fixed demo project and session. Do not add project switching or persistence UI unless a later goal explicitly introduces it.

## Design principles

- **Authoritative state over assistant prose:** Revision and artifact UI changes only from typed authoritative events and validated artifact metadata. Assistant wording may explain a result but cannot create a success badge, current-revision change, viewer swap, or export action.
- **Continuity over spectacle:** Keep the current valid model visible while new work runs. A subtle state overlay is preferable to clearing the canvas or replacing it with a full-screen spinner.
- **Progressive technical detail:** Show plain-language activity (“Validating the model”) first; tool name, IDs, hashes, and diagnostics belong in an expandable detail region.
- **Inspection, not editing:** Camera controls must look and read as view controls. Every geometry change begins in chat or history restore; the canvas does not expose selection/edit affordances.
- **One dominant action per state:** Blank → send the starter request; active → cancel; valid current model → continue refining; export-ready → download 3MF. Secondary actions remain quieter.
- **Trust through restraint:** Use color, motion, badges, and elevation only to communicate hierarchy or state. A validation success should feel conclusive because the rest of the interface is calm.
- **Tradeoffs:**
  - Prefer explicit state labels over a visually minimal but ambiguous interface.
  - Prefer grouped activity summaries over raw event firehoses.
  - Prefer desktop model area over chat width, while never shrinking chat below a usable reading/composer width.
  - Prefer a strong empty-state prompt over a broad template gallery.
  - Prefer local font assets and stable builds over runtime font fetching.
  - Preserve revision accuracy and resource cleanup even if that delays a visual swap.

## Visual language

- **Color:** Extend the existing dark foundation and mint accent into a cohesive non-gradient system. Recommended semantic tokens:

  | Token | Value | Use |
  | --- | --- | --- |
  | `--canvas` | `#0A0D0C` | Browser background and viewer void |
  | `--surface-1` | `#111614` | Main panels |
  | `--surface-2` | `#18201C` | Controls, composer, raised activity |
  | `--surface-3` | `#202B25` | Hover/selected neutral surfaces |
  | `--line` | `#34423A` | Boundaries and inactive grid |
  | `--line-strong` | `#52665A` | Focus-adjacent boundaries and active dividers |
  | `--text` | `#F1EFE6` | Primary text |
  | `--text-muted` | `#A8B3AB` | Secondary text; verify 4.5:1 on its surface |
  | `--mint` | `#68D8C4` | Interactive/focus and verified-preview accent |
  | `--amber` | `#F2B84B` | Current revision and active-work accent |
  | `--success` | `#82D99B` | Completed/validated state |
  | `--danger` | `#FF7669` | Rejected/error state |
  | `--warning` | `#F5C66A` | Time/resource warning |
  | `--model` | `#DDE5DD` | Primary model material |

  Do not encode status by color alone. Use icon, label, and position. Avoid broad accent-filled backgrounds; accents work best as 1–2 px rails, focus rings, status dots, and small button fills.
- **Typography:** Use **Barlow Semi Condensed** (500/600/700) for interface headings and concise labels, and **IBM Plex Mono** (400/500) for dimensions, revisions, hashes, timers, and tool details. Use a readable humanist fallback only until local WOFF2 assets are approved and vendored. Do not retain Inter as the intentional brand face. Subset and self-host fonts through `next/font/local` so offline/local builds do not fetch remote assets; include license notices before public distribution.
- **Type scale:** `12/16` metadata, `14/20` interface copy, `16/24` chat/body, `20/24` section title, `28/32` empty-state title. Monospace identifiers should not exceed 13 px by default and must truncate in the middle with full value available to assistive tech/copy affordance.
- **Spacing/layout rhythm:** 4 px base; primary spacing steps `4, 8, 12, 16, 24, 32, 48`. Panel padding is 16 px at narrow widths and 20–24 px on desktop. Viewer controls use 8 px gaps; chat turns use 20–24 px vertical separation. Avoid card nesting deeper than two visual surfaces.
- **Shape/radius/elevation:** Technical, not bubbly. Use 4 px for compact controls, 8 px for panels/composer, and a 12 px maximum for the largest sheet. Use 1 px borders as the primary separation; one restrained shadow token (`0 16px 48px rgb(0 0 0 / 0.28)`) is reserved for drawers/sheets. Chat messages should not all become rounded speech bubbles: user turns may use a bounded surface; assistant content and activity read as an editorial transcript.
- **Viewer treatment:** A near-black field with a subtle orthographic-style floor grid and small axis triad. The model is matte warm gray with mint rim/selection-independent edge emphasis. Grid density must remain legible but quiet, and no control may imply geometry selection. Show `mm · Z up` as persistent viewer metadata.
- **Motion:** Use `120 ms` for control feedback, `180 ms` for panel/status changes, and `240 ms` for drawers. On first render, fade the two workspace shells and resolve the revision rail over no more than 240 ms; do not stagger chat rows or animate every tool event. Viewer revision swaps may cross-fade only after the new geometry has parsed and validated. No continuous ambient animation. Under `prefers-reduced-motion: reduce`, remove transforms, camera tweening, pulsing, and cross-fades; state changes become immediate.
- **Imagery/iconography:** No stock imagery is required. Use a consistent outlined technical icon set if already available through the selected viewer/UI dependencies; otherwise create minimal inline SVG icons owned by the site. Icons use 1.5 px strokes and always have text or accessible names. The empty viewer may use a CSS/canvas wireframe bracket silhouette derived from the canonical part, but it must be labeled as an example—not a loaded model.

## Components

- **Existing components to reuse:** No reusable UI components currently exist. Reuse `RootLayout`, the global stylesheet entry, the browser-safe `@rjls/contracts` exports, and the existing secure `/v1/chat` route. Preserve the repository's small, package-native component style rather than importing an unrelated design-system layer.
- **New/changed components:**

  | Component | Responsibility | Key variants/states |
  | --- | --- | --- |
  | `ModelWorkspace` | Owns page composition and shared UI state derived from events | blank, ready, generating, recoverable error |
  | `AppHeader` | RJLS identity, local/demo label, system readiness disclosure | ready, limited/mock, renderer unavailable |
  | `ModelViewer` | Loads and validates the current STL, manages camera and GPU disposal | empty, loading-first, updating-with-current, ready, artifact error, WebGL unavailable |
  | `ViewerToolbar` | Orbit help, fit, reset, zoom, and accessible keyboard entry/exit | default, keyboard-focused, disabled |
  | `ModelFacts` | Current revision, bounds/dimensions, units, format, artifact size/hash disclosure | blank, current, stale-loading, unavailable |
  | `RevisionRail` | Connects current viewer revision to history/activity | no revision, current, promoting, restored |
  | `ChatPane` | Transcript, grouped activity, terminal state, composer | empty, streaming, failed, complete, cancelled |
  | `ChatTurn` | User request and assistant response | user, assistant-streaming, assistant-complete |
  | `ToolActivity` | Plain-language ordered summary of tool/revision events | running, success, rejected, cancelled, expandable details |
  | `ChatComposer` | Request entry, starter prompts, send/cancel behavior | empty, ready, submitting, streaming, disabled |
  | `RevisionHistory` | Lists immutable revisions and restores one as a new child | current, historical, restore-pending, restore-failed |
  | `ExportAction` | Requests/downloads validated 3MF for the current revision | unavailable, ready, preparing, success, failed |
  | `StatusNotice` | Inline recoverable error, warning, or system limitation | info, warning, error, success |

- **Variants and states:**
  - Tool names map to user language: `get_project_state` → “Checking project,” `read_model_source` → “Reading current model,” `propose_model_source` → “Drafting a revision,” `validate_and_render` → “Validating and rendering,” `promote_candidate` → “Making revision current,” `export_model` → “Preparing 3MF,” `list_revisions` → “Loading history,” `restore_revision` → “Restoring as a new revision.” Raw names remain available in details.
  - Candidate states are visually separate from authoritative revisions. “Candidate validated” is not “Current revision” until promotion/current arrives.
  - The viewer's `updating-with-current` state keeps the current geometry fully visible and overlays a compact progress strip; never dim it so far that it appears invalid.
  - History labels revisions sequentially for scanning (`R1`, `R2`, `R3`) while retaining the opaque canonical ID in details. “Restore” creates and focuses a new revision; never label it “Revert to old current.”
  - Export is enabled only for a current revision with a validated 3MF artifact matching that revision. Preview STL is never labeled the fabrication export.
- **Token/component ownership:**
  - CSS custom properties and global resets belong in `apps/site/src/app/styles.css` until multiple themes or packages justify a separate token layer.
  - Workspace components belong under `apps/site/src/components/`; browser-only stream/viewer utilities belong under `apps/site/src/lib/`.
  - Event schemas, limits, event names, revision/artifact meanings, and public error codes remain owned by `packages/contracts`; do not duplicate them as UI-only enums.
  - Gateway/MCP/runtime packages own agent, tool, and renderer truth. UI components may format state but must not infer or fabricate domain transitions.
  - Three/R3F objects, abort controllers, geometry/material disposal, camera state, and WebGL fallback belong inside the viewer boundary rather than page composition.

## Accessibility

- **Target standard:** WCAG 2.2 AA for the G005 interface. Aim for 4.5:1 text contrast, 3:1 large text and meaningful non-text controls, and visible focus that does not rely on color alone.
- **Keyboard/focus behavior:**
  - DOM and focus order: skip link → app/status controls → viewer toolbar → viewer keyboard entry → current revision/history/export → transcript → composer.
  - All buttons, disclosures, history actions, starter prompts, send/cancel, and export use native interactive elements and visible `:focus-visible` rings of at least 2 px with 2 px offset.
  - Viewer controls expose buttons for fit/reset/zoom so camera inspection never depends on pointer gestures. If keyboard camera control is implemented, arrows orbit, `Shift`+arrows pan, `+`/`-` zoom, `0` resets, and `Escape` releases viewer focus. Put the shortcut help beside the viewer and prevent keyboard trapping.
  - Sending uses `Ctrl+Enter`/`Cmd+Enter`; plain Enter inserts a newline. During a request, Send becomes disabled and Cancel is the primary available action. After completion or recoverable failure, focus remains in or returns to the composer; do not steal focus when events arrive.
  - On restore/export, keep focus on the invoking control until a terminal result, then announce the result. If a drawer closes, restore focus to its trigger.
- **Contrast/readability:** Minimum 14 px for persistent UI copy, 16 px for conversation copy, 44×44 CSS px touch targets, and no text over the active 3D model except within an opaque/near-opaque labeled surface. Support 200% browser zoom without hidden actions or overlapping panels.
- **Screen-reader semantics:**
  - Use landmarks (`header`, viewer `section`, chat `section`, `aside` or dialog for history) with unique headings.
  - The canvas has a concise accessible name and description, but the model's revision, dimensions, units, validation state, and available actions must also exist as structured text outside the canvas.
  - Transcript uses a labeled list/feed; tool activity uses an ordered list with explicit status text. Do not announce every streamed token. Announce completed assistant blocks and state transitions through a debounced `aria-live="polite"` region; terminal blocking errors use `role="alert"` once.
  - Decorative grid, tick marks, and icons are hidden from assistive tech. Icon-only controls require accessible names and tooltips that are also keyboard reachable.
- **Reduced motion and sensory considerations:** Honor `prefers-reduced-motion` as defined in Visual language. Progress always includes text, not only motion. Success/error always includes label/icon, not only green/red. Avoid flashing, rapidly rotating default models, auto-orbit, audio, and haptic-only feedback.

## Responsive behavior

- **Supported breakpoints/devices:**
  - `>=1280 px`: primary desktop split, approximately `minmax(560px, 1.65fr) / minmax(400px, 1fr)`.
  - `1024–1279 px`: tighter desktop split near 58/42; compact viewer facts and icon-plus-tooltip secondary controls.
  - `768–1023 px`: stacked workspace; viewer occupies roughly 46–54 visual viewport height with chat below, no overlap, and the composer sticky within the chat region.
  - `<768 px`: single-column flow; viewer minimum height 300 px (or 42svh where space permits), condensed facts, in-flow history disclosure, full-width composer. Validate down to 360 px width.
- **Layout adaptations:** Use CSS Grid for the desktop shell and document flow/grid rows for narrow layouts. Prefer `svh`/`dvh` with a safe fallback over fixed `100vh`. The model canvas may resize, but the current-revision strip, key facts, and viewer controls must remain visible. Long IDs use middle truncation without forcing horizontal scroll. The composer respects safe-area insets.
- **Touch/hover differences:** Orbit uses one-finger drag, pan uses two-finger drag, and pinch zoom is allowed only within the viewer; provide textual help and keep page scrolling possible outside the canvas. Do not hide essential actions until hover. Hover previews may enhance desktop but must have focus and tap equivalents.
- **Orientation:** Landscape tablets may use the desktop split if both pane minimums are satisfied; portrait uses the stacked layout. A resize must not reset camera state or current revision.

## Interaction states

- **Loading:**
  - Initial project check: show the full workspace skeleton with stable dimensions and a plain “Checking local project…” label; avoid a blank page spinner.
  - First model: viewer shows the labeled bracket example/empty grid plus activity. No geometry is treated as current until authoritative artifact/revision events arrive.
  - Later edit: retain current geometry and camera, display “Building from Rn” in an amber progress strip, group current tool steps under the active assistant turn, and offer Cancel.
  - Artifact load: parse off the main interaction path where practical; swap only after validation. Ignore stale completion and dispose superseded resources exactly once.
- **Empty:** State “No model yet” and explain “Describe a dimensioned part in chat. The viewer is for inspection; changes happen through conversation.” Offer the canonical bracket starter as the primary example, with at most two secondary prompt chips. Do not imply arbitrary mesh import.
- **Error:**
  - Recoverable candidate/render error: keep the current valid geometry, mark the attempt rejected, show safe actionable copy, and allow a revised prompt. Do not attach the error styling to the current revision.
  - First-render error with no valid model: retain the empty grid and explain that no revision was promoted.
  - Viewer artifact error: keep the previous geometry; show “Preview could not be verified. Rn remains current.” Offer retry/refetch if the implementation supports it.
  - Renderer/service unavailable: disable model-changing sends and export if they cannot succeed, but keep history/current facts readable. Never suggest that a native/local fallback is equally isolated.
  - WebGL unavailable/context lost: replace the canvas with the textual model facts and a clear compatibility notice; chat and export remain usable when their dependencies are ready.
- **Success:** Advance the revision rail and current badge only on authoritative promotion/current. Use one restrained 180 ms rail/fact transition and a polite announcement such as “R3 is now current.” Preserve camera state on same-project swaps. Successful export states “R3 · 3MF · millimeters” and provides the validated download.
- **Disabled:** Disabled controls retain readable labels and expose a concise reason in adjacent text or `aria-describedby`; do not use disabled opacity below readable contrast. While streaming, history restore and export actions that could conflict with the request are unavailable, with Cancel remaining enabled.
- **Offline/slow network:** This is local-first but browser-to-local-service delay still exists. After 300 ms show activity; at 30 s change copy to “Still rendering—your current model is unchanged”; at the 120 s request limit show the structured timeout state. Do not claim browser offline status proves the renderer is unavailable. Retry creates a new explicit request and never replays a promotion invisibly.

## Content voice

- **Tone:** Clear, technical, and reassuring without marketing inflation. Short sentences. Active voice. Name the object and operation before naming the technology.
- **Terminology:**
  - Use “OpenSCAD,” “3D viewer,” “model inspection,” “current revision,” “candidate,” “validated preview,” “restore as a new revision,” “3MF export,” “millimeters,” and “Z up.”
  - Use “conversation” or “request” for user input; use “tool activity” in the default UI and reserve “MCP” for expanded system details.
  - Never call orbiting/panning “editing.” Never call STL the canonical model or fabrication export.
- **Microcopy rules:**
  - Prefer concrete progress: “Validating the bracket” over “Working magic”; “R2 is now current” over “Done!”
  - Explain preservation on failure: “The candidate was rejected. R2 remains current.”
  - Tie actions to state: “Export R3 as 3MF,” “Restore R1 as a new revision.”
  - Translate stable error codes to safe user language, with the code available in details for diagnosis. Never show prompts, raw source, credentials, host paths, container commands, or stack traces by default.
  - Bound assistant claims to observed results. “Preview validated against the configured checks” is acceptable; “ready to manufacture” is not.
  - Empty-state starter example: “Create an 80 × 40 mm mounting bracket with a 6 mm base and two 5 mm mounting holes.”

## Implementation constraints

- **Framework/styling system:** Next.js 15 App Router, React 18, and TypeScript in `apps/site`; global CSS is the current styling system. Prefer small client components at interaction boundaries and keep the page/layout server-renderable where practical. Do not introduce a UI framework, CSS-in-JS runtime, state library, or separate design-system package for G005.
- **Viewer constraint:** The approved/requested direction is Three.js through React Three Fiber, `STLLoader`, and only selective helpers needed for orbit/pan/zoom/fit/reset. WebGL and loader code must stay client-only and should be dynamically loaded. No direct manipulation, editing gizmos, mesh upload, or arbitrary format expansion.
- **Design-token constraints:** Implement the semantic CSS variables above at `:root`; components consume semantic names rather than raw hex. Keep dark as the only G005 theme. Typography assets must be locally served and licensed before public distribution. If fonts cannot be vendored within G005, retain a documented fallback but do not add a remote runtime font dependency.
- **Data/state constraints:** Parse the v3 NDJSON stream through `@rjls/contracts`. Events must remain sequence-aware and session-bound. Only revision/artifact events may update authoritative model state. The UI must abort stale artifact fetches, validate the expected MIME/revision/hash/byte and triangle budgets before display, preserve last-known-valid geometry, and dispose superseded Three resources.
- **Performance constraints:**
  - Honor preview limits of 10 MiB and 250,000 triangles; export limit is 25 MiB.
  - Target viewer p95 decode/swap at or below 1.5 s over 20 loads.
  - After 100 revision swaps, retained heap growth must be at or below 20 MiB where forced-GC measurement is supported; otherwise collect disposal counters and a browser trace.
  - Cap renderer pixel ratio to a deliberate maximum (recommended `1.5`) unless profiling proves higher density fits the budget. Pause render-loop work when the viewer is not visible and avoid auto-rotation.
  - Subset local fonts, avoid large blur/backdrop-filter layers over the canvas, reserve layout space for status/composer, and prevent cumulative layout shift during streaming.
  - Respect the 30 s warning, 60 s render kill, 120 s request limit, eight tool-round limit, and two repair-attempt limit in progress copy; UI timers must not imply looser server behavior.
- **Compatibility constraints:**
  - **Assumption:** Support current and previous major versions of Chromium, Firefox, and Safari on desktop; current iOS Safari and Android Chrome for the stacked experience.
  - Provide a textual/WebGL fallback and keep chat/history/export usable where possible.
  - Support mouse, trackpad, touch, keyboard, 200% zoom, forced-colors mode, and reduced motion. Avoid hover-only or fine-pointer-only actions.
  - The primary local runtime is credential-free mock mode unless a separately approved live provider is configured. Do not expose provider selection in G005.
- **Test/screenshot expectations:**
  - Component/state tests cover every typed event mapping, candidate-vs-current distinction, send/cancel focus behavior, history restore labeling, export gating, and safe error mapping.
  - Viewer tests cover stale-load abort, failed-parse preservation, exact-once disposal, current-revision/hash matching, same-project camera preservation, explicit reset, and WebGL fallback.
  - Accessibility checks cover landmarks/headings, names, focus order, focus restoration, live-region deduplication, keyboard viewer escape, 44 px targets, contrast, reduced motion, 200% zoom, and no keyboard trap.
  - Responsive screenshots are required at 1440×900, 1100×800, 900×1024, 768×1024, and 390×844 for blank, updating-with-current, ready R3, recoverable error, open history, and export-ready states. Include reduced-motion and forced-colors evidence where automation supports it.
  - Production build, lint, typecheck, targeted site tests, package-boundary checks, and the root verification command must pass. Browser bundle scans must find no provider/MCP-server/runtime secrets or Node-only packages.
  - G006 owns the full canonical real-path and hostile-path e2e. G005 must leave stable selectors/state boundaries so G006 can prove blank → R1 → R2 → R3 → export without redesigning the interface.

## Open questions

- [ ] **Font assets and licenses / G005 executor + repository owner / Medium:** Confirm locally vendorable Barlow Semi Condensed and IBM Plex Mono WOFF2 files and notices. Until confirmed, use documented fallbacks without remote runtime fetches.
- [ ] **Exact R3F/Three/Drei versions and licenses / Architecture checkpoint owner / High:** Use only the checkpoint-approved versions; changing viewer packages or artifact format requires a checkpoint update.
- [ ] **Artifact download route shape / Site + model-project owners / High:** The route is planned but absent. It must serve opaque validated artifacts with revision/hash/MIME/size binding before viewer and export success can be complete.
- [ ] **Model-facts source / Contracts owner / Medium:** Current artifact manifests contain bounds/units/triangle count, but friendly named dimensions may need a browser-safe manifest projection. Do not parse dimensions from assistant prose.
- [ ] **Revision display labels / G005 executor / Low:** Confirm whether sequential `R1/R2/R3` labels can be derived deterministically from ordered revision history; always preserve the opaque canonical ID in details.
- [ ] **System-readiness endpoint / Runtime + site owners / Medium:** G005 needs an honest renderer-unavailable state. If no browser-safe readiness contract exists, use only errors observed from the current request and avoid speculative global health claims.
- [ ] **Screenshot harness / G006 owner / Medium:** No Playwright or visual-baseline setup exists yet. G005 should provide deterministic mock states; G006 should select and approve the browser harness without weakening the screenshot matrix.
- [ ] **Public RJLS logo asset / Repository owner / Low:** No logo exists. Use a typographic RJLS mark for G005; introducing a brand asset later should not alter layout or accessibility.
