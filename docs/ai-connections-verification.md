# AI connections implementation verification

Verified November 9, 2026 using Node 24.21.0 and pnpm 11.17.0.

## Automated evidence

- `pnpm verify` passed: formatting, conventions, architecture, package/browser
  boundaries, lint, workspace type checking, Node tests, browser tests, and the
  production Next.js build. Architecture/convention baselines remain empty.
- The Node runner discovered 418 tests: 415 passed and the three existing optional
  runtime checks remained skipped. Installer and boundary checks also passed.
- All 64 Playwright checks passed across Chromium and forced-colors/reduced-motion
  configurations, including connection CRUD/default/testing, manual model selection,
  missing configuration, offline feedback, and active-turn selection locking.
- Review regressions cover cancellation before Ollama response headers and during a
  stalled body, followed by a usable next job. Provider response tests reject an
  oversized SDK completion, stop decoded JSON/SSE streams before EOF, and release
  upstream resources on overflow, cancellation, and graceful-close failure. Generated
  companion commands include the HTTP loopback opt-in for localhost, IPv4 and IPv6.
- Controlled HTTP fixtures exercised OpenAI, Anthropic, Gemini, Ollama, and compatible
  adapters without real provider traffic. Tests verified explicit credentials,
  structured tool calls/results, sanitized provider errors, and no environment-key
  fallback. A native authentication failure was exercised through the agent stream.
- A connected-model fixture completed create/validate/promote/revise/export through
  hosted CAD tools. Unauthorized context failed before model invocation. Existing
  cancellation, repair, payload, and tool-budget regressions passed.
- PGlite ran the committed migrations and verified account isolation, encryption,
  default selection, companion authorization, leases, duplicate/conflicting
  completions, cancellation, expiry, offline status, payload cleanup, and account
  deletion cascades. Encryption tests covered owner/connection binding and retained
  rotation keys. Endpoint tests rejected private/mixed-DNS and reserved addresses.
- The versioned worker tarball passed
  `node tooling/local-worker/packedAcceptance.script.mjs --smoke` after packing:
  exact-version installation through a disposable registry/fresh external store,
  portable dependency pins and allowlisted contents, AI help without Chromium,
  missing-browser diagnostics, and the existing eleven-tool stdio handshake.

## Separate acceptance and rollout

No real provider token or running Ollama/LM Studio/vLLM endpoint was used for these
checks. Model quality, a real authenticated provider/browser journey, physical CAD
fit, and live provider cancellation remain acceptance work.

The skipped runtime tests are the existing disabled 20-run p95 budget scenario,
real PostgreSQL export/concurrency scenario, and standalone PostgreSQL/browser-peer
stdio scenario. PGlite/fixtures do not establish those live behaviors.

No deployment, npm publication, production flag change, or live acceptance occurred.
Migration, encryption keys, OAuth prerequisites, key rotation, and user setup are
documented in [AI connections](ai-connections.md). Worker version 0.2.0 requires a
separate registry release before the website's exact-version commands are usable
by end users.
