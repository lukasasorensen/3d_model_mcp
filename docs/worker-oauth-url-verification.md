# Worker OAuth URL preservation

Contributes to THE-15. Verified October 29, 2026 on Node 24.21.0.

## Failure and fix

Production authorization GET requests returned `400 invalid_request` before
sign-in. Next.js 15.5.22 rewrites the first loopback address in the whole request
URL during normalization. With the production `0.0.0.0` bind address, this changes
the encoded worker callback from `127.0.0.1` to `localhost`. The worker's exact
callback policy correctly rejects it. A diagnostic server bound to `127.0.0.1`
masked the problem because normalization matched the outer hostname first.
Redeployment did not resolve it; the earlier running-state hypothesis was wrong.

Set the documented `skipMiddlewareUrlNormalize` Next configuration option so
request URLs reach handlers unchanged. Callback registration, exact matching,
PKCE, scopes, token policies and database schemas remain unchanged. This setting
applies site-wide; the site has no middleware or custom rewrite configuration.

References: [upstream reproduction](https://github.com/vercel/next.js/issues/79182)
and [Next.js 15 URL normalization option](https://nextjs.org/docs/15/app/api-reference/file-conventions/middleware#advanced-middleware-flags).

## Verification

- Regression test fails before the configuration change and passes afterward.
  It uses the pinned Next build-definition mapping and actual `NextRequest`,
  covering a public origin, `0.0.0.0`, and loopback, plus worker, changed-port and
  hosted-client callbacks with opaque state containing a loopback address.
- Existing real-provider Codex and worker OAuth lifecycle tests pass, including
  callback rejection, PKCE, consent, refresh, storage and revocation.
- Full `pnpm verify` passes; the three existing optional/performance skips remain.
- Rebuilt standalone server bound to `0.0.0.0`, using disposable PostgreSQL 18.6
  with the existing migrations and a synthetic worker registration: GET and form
  POST both return the sign-in URL with callback and state intact. A changed
  worker callback port still returns `400 invalid_request`.
- Temporary standalone process and database are removed after verification.

## Delivery boundary

The fix requires explicit merge authorization and the resulting Coolify rollout.
After deployment, verify a synthetic public GET reaches sign-in before starting
another real packaged worker login. Local tests do not establish successful
production login, native credential lifecycle, or either real-client journey.
THE-15 remains In Progress; package publication and the other acceptance gates
remain separate. No production application files were modified for this test.
