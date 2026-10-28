# Site presentation alignment

Stage 6 completion ([THE-29](https://linear.app/theoryfoundry/issue/THE-29)),
continuing merged PR #19 at `755b9a2`. The HTTP slice is documented in
[site HTTP alignment](site-http-alignment.md).

## Ownership and public APIs

| Feature             | Browser responsibilities                                                                                 |
| ------------------- | -------------------------------------------------------------------------------------------------------- |
| `workspace`         | Project landing, workspace presentation/state hook, revision history, snapshot loading and reducer       |
| `model-preview`     | Viewer, source inspection, source integrity, active preview cancellation and PNG completion              |
| `browser-rendering` | Injected browser renderer contract/context, render completion, presence and foreground/background leases |
| `exports`           | Bounded browser download delivery                                                                        |
| `chat`              | Chat pane, turn contracts, stream protocol and sidebar flag hook                                         |
| `authentication`    | Sign-in, OAuth navigation/consent and connected apps                                                     |
| `onboarding`        | Codex connection dialog, commands and starter prompts                                                    |
| `project-events`    | Event stream client and reconnect/synchronization hook                                                   |

Each feature's `browser/index.ts` is a re-export-only browser API. Existing
feature-root indexes remain server APIs. Browser code never imports those server
indexes. Workspace orchestration consumes browser APIs; chat owns its own turn
contracts so the presentation graph stays acyclic. State contracts, revision
selectors and the reducer are separate modules. The workspace component owns JSX;
`useModelWorkspace` owns state, effects and UI actions.

`browserRenderer.composition.ts` owns worker construction and the shared mesh
cache, preserving the prior cache lifetime. `workspace.composition.tsx` supplies
those stable capabilities through a React context. Feature services receive only
the render function they need; they do not import composition or peer services.
The viewer and orchestration hooks consume the injected renderer. The public
browser-renderer package API and all package identities remain unchanged.

`openScadWorker.composition.ts` installs the worker at the application source root.
The previous `lib/cad-renderer.adapter.ts` and `lib/openscad.worker.ts` paths and
both exact compatibility declarations are removed. The worker remains a module
worker named `openscad-render`; `/vendor/openscad/openscad.js`, the WASM/BOSL2 asset
paths, pins and integrity checks are unchanged. Next.js owns emitted chunk URLs.

## Preservation and test movement

All remaining source tests move under `apps/site/tests`, mirroring their owning
implementation stems. The old mixed workspace suite is split into reducer,
revision/artifact, presentation and viewer-resource suites with a shared fixture.
The accessibility contract reads the new component paths and tolerates formatter
whitespace without weakening its landmark/control assertions.

All 32 test declarations from the old source tree remain. All 34 HTTP route
modules have identical syntax trees excluding imports and formatting. Of the 28
moved library function bodies, 24 are identical after ignoring formatting; the
three browser completion functions forward an injected render capability and the
MCP rendering hook obtains those capabilities from context. The workspace hook
and viewer preserve effect cleanup, generation guards, renderer leases,
last-known-valid geometry, session storage, cancellation and ownership checks.

Architecture records decrease **60 → 0**. Convention records decrease **72 → 27**;
every retained record is unchanged. No exception is added, widened or retargeted.
The remaining convention debt belongs to stage 7: framework formatting, styles,
operator entry points/configuration and documentation. Node 24 remains stage 8.

## Verification

- Full `fnm exec --using 22 pnpm verify` passes: 271 tests pass, with the three
  existing optional skips, across 92 files and nine projects. The site suite
  passes all 63 tests without skips. Architecture/tooling regressions, production
  build and resolved/built client boundary checks pass.
- Local authenticated browser acceptance uses a disposable PostgreSQL database,
  a disposable account and a loopback flag-response fixture. No live flags or
  production configuration are changed. The browser uses the actual pinned WASM
  renderer and the deterministic mock chat provider.
- Sign-in and project creation reach a ready workspace. Ctrl+Enter submits the
  starter prompt, renders R1 and restores composer focus after completion. R2
  promotion updates bounds; selecting R1 preserves the current revision. Restore
  creates R3 while preserving historical inspection. Chat collapse/restore and
  browser download controls remain available in the correct states. STL downloads
  successfully and its file SHA-256 matches the receipt. GLB and 3MF generation
  produces completion receipts. The Codex dialog switches global/repository scope;
  the connected-apps page renders its authenticated empty state.
- Authenticated presence succeeds; local/remote render, export and preview claim
  endpoints return their idle responses, closing the previous auth dependency
  blocker. This does not claim external Codex/OAuth client acceptance.

The authenticated UI journey runs in Next.js development mode. A separate local
production-mode sign-in reached the existing HTTPS-origin guard when loading
projects over loopback HTTP; no local trusted CA is configured. Production build
and client-bundle checks pass, but HTTPS production-browser acceptance is not
claimed. This does not change the deployed HTTPS configuration.

PR and exact-head CI evidence are recorded in Linear. Stage 6 is ready for review;
merge still requires explicit authorization. Deployment, production migrations,
external client acceptance and the separate worker-delivery roadmap are unchanged.
