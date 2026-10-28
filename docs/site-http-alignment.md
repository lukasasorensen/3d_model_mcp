# Site HTTP alignment

[THE-29](https://linear.app/theoryfoundry/issue/THE-29) starts from stage 5's
completion in PR #18 (`6979174`). This first slice organizes server HTTP
boundaries. Workspace, viewer, chat presentation, authentication UI and onboarding
remain for the next slice; their client directives and browser entry points are
unchanged here.

## Ownership

| Feature             | Responsibility                                                             |
| ------------------- | -------------------------------------------------------------------------- |
| `authentication`    | Injected session admission, origin policy and safe HTTP responses          |
| `browser-rendering` | Local MCP claim/completion controllers and opt-in bridge policy            |
| `model-preview`     | Preview HTTP controller, owned dependency contract and bounded JSON reader |
| `exports`           | Export claim/completion/download controllers and owned dependency contract |
| `chat`              | Server feature-flag evaluation and chat admission controller               |
| `project-events`    | Authorized event stream, notification scoping and subscription cleanup     |
| `readiness`         | Readiness response mapping with injected probe                             |

Next.js `app/**/route.ts` files remain framework composition entries. Existing
root composition modules wire runtime capabilities into feature controllers.
Cross-feature imports use public indexes; internal imports point directly to
lower-level modules. Types and ports do not import implementations. Services do
not consume other services.

These feature-root indexes expose server capabilities. Do not import them from
client components. The [presentation continuation](site-presentation-alignment.md)
adds separate `browser/index.ts` APIs and verifies resolved client graphs and built
bundles.

## Tests and compatibility

Relocated route tests now mirror the owning controllers, services and utilities
under `apps/site/tests/features`. Cross-route checks remain in
`tests/projectRoutes.integration.test.ts`. The site TypeScript configuration
checks this tests tree alongside the existing source tests during migration.

Preserve origin/authentication ordering, owner/project/session binding, feature
flags, response schemas/statuses and error redaction. Keep event stream
authorization, heartbeat behavior, cancellation and subscription cleanup intact.
Keep framework route names, public URLs, deployment configuration and Node 22.

Comparison with the merged base confirms all 18 moved function bodies and all
34 framework route bodies are unchanged, ignoring imports and formatting. All
15 original relocated test declarations remain, including the parameterized chat
admission cases. Five new tests cover export/preview admission and binding,
operational error mapping and bounded UTF-8 JSON reads with reader cleanup.

## Verification and remaining work

Run the site tests, typecheck, client/package/architecture boundary checks and
full `pnpm verify`. Exercise built HTTP admission routes locally. Record exact
PR-head CI in Linear and the PR. This structural server slice does not establish
browser UI acceptance; the presentation migration requires browser checks.

Local Node 22 verification passed: 271 tests passed across 89 files and nine
projects, with three existing optional skips. Site tests passed all 63 cases.
The production build and client/package/architecture checks passed. Built HTTP
smoke checks confirmed foreign-origin rejection for project creation, preview
presence and export claims, plus the unchanged installer URL (four checks).
A local-bridge request returned the existing authentication
unavailable response before reaching bridge policy because the local auth
dependency was unavailable; bridge policy is covered by the focused unit tests.
Authenticated browser acceptance remains part of the following presentation slice.

Architecture records shrink from 76 to 60 and convention records from 85 to 72.
Every retained record is unchanged; none are added, widened or retargeted.
The remaining THE-29 work includes workspace state/UI test splits, browser renderer
host composition, client hooks, authentication/onboarding UI and browser acceptance.
Stage 7 handles final convention debt; Node 24 remains stage 8. No deployment or
live acceptance is part of this slice.
