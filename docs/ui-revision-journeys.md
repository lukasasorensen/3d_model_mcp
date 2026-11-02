# Revision journey browser integration

The `useModelWorkspace.hook.test.mjs` Playwright tests exercise the real workspace
hook, reducer, snapshot loader, revision/source components, source hash validation,
renderer lease, export hashing, and browser download helper at 1440px and 390px.

The tests hydrate R1/R2 through contract-validated HTTP fixtures, inspect R1, read
its verified source, and download current R2. They inspect the downloaded bytes
and filename. A corrupted source response must show an error without downloading.
A failed restore preserves R2; retrying successfully hydrates R3 while preserving
inspection of R1 and updates the download action to R3.

This uncovered an old restore-failure alert persisting after a successful retry.
Starting a new restore now clears the previous workspace notice. Both viewport
regressions failed before the fix and pass afterward.

Run `pnpm test:browser useModelWorkspace.hook` or the complete `pnpm verify`.
The seven browser tests are included in verification and CI.

## Boundaries

HTTP responses, Next navigation, the viewer and CAD byte generation are fixtures.
Every browser request is intercepted; unexpected requests fail. No database,
authentication, production service, real CAD generation, or installer is exercised.
The source SHA-256 and download-byte checks are real. The separate viewer test
covers actual WebGL initialization. Authenticated end-to-end and screen-reader /
native-device acceptance remain outstanding under THE-41.
