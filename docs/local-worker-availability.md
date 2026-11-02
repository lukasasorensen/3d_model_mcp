# Local worker availability and browser-only launch

THE-43 extends the existing server environment gate to onboarding. The server-only
`localWorkerEnabled` policy returns true only when **both** variables equal the
exact string `1`:

```dotenv
THEORYFOUNDRY_REMOTE_MCP_ENABLED=1
THEORYFOUNDRY_LOCAL_WORKER_ENABLED=0
```

The worker flag defaults to `0` in `.env.example` and Coolify Compose. Missing,
`0`, and other strings (including `true`) disable it. This is an environment
setting, independent of Unleash. Keep remote MCP enabled for hosted Codex access.
The project server page and Settings → Connected Apps pass only an availability
boolean to browser components; absent availability defaults to disabled.

With the worker disabled, both connection dialogs present browser rendering for
Codex, installation scope, the existing hosted setup command and (inside a project)
the starter prompt. Keep the matching project tab visible during rendering. There
is no worker choice, Claude selector, or worker package installation command.
With both flags on, the existing browser/Mac choices, Codex/Claude selection and
scope-specific commands remain. Claude's full client journey remains unverified.
With remote MCP off, workspace connection controls remain absent and Connected
Apps remains unavailable as before.

This gate does not resolve OpenSCAD redistribution or proprietary integration
concerns. The browser still receives the existing JS/WASM. Renderer assets, pins,
worker packages, identities, stored projects and database schema are unchanged.

## API and authorization audit

All worker operations use the same server policy, independently of UI visibility:

| Route prefix             | Operations                                        |
| ------------------------ | ------------------------------------------------- |
| `/v1/worker/validation/` | `begin`, `status`, `complete`, `cancel`           |
| `/v1/worker/exports/`    | `begin`, `status`, multipart `complete`, `cancel` |
| `/v1/worker/preview/`    | `source`                                          |

When either flag is disabled, these nine POST routes return 404 `NOT_FOUND` with
`Cache-Control: no-store` before origin checks, authentication, body reads or
service/database creation. When enabled, existing OAuth bearer authentication,
resource/scope/current-grant checks, origin restrictions, input limits, ownership,
leases, error responses and idempotency remain authoritative.

No other worker HTTP routes were found. The dedicated worker OAuth registration
and callback policy share the hosted `<origin>/mcp` resource and `cad:tools` scope.
They remain available under remote MCP's existing policy. Existing grants and
refresh tokens are preserved; none bypass the worker API gates. Hosted `/mcp`,
OAuth metadata/consent/refresh/revocation, authenticated project/source reads,
browser render jobs and artifact downloads remain governed by their existing
policies. No additional worker-only authorization gate is needed there. Operator
OAuth provisioning and offline CLI/renderer setup are not worker HTTP access.

## Separate production rollout

Do not infer the running flag from repository defaults. After review and explicit
merge/promotion/deployment authorization:

1. Promote the verified integration through `develop` to `master` separately.
2. In Coolify application `3dModelMakerMCPAI`
   (`yjcpwok2vq6r2yeiposbbip2`, production), inspect the effective application and
   shared environment. Set `THEORYFOUNDRY_LOCAL_WORKER_ENABLED=0`, preserving
   `THEORYFOUNDRY_REMOTE_MCP_ENABLED=1`. Do not copy rendered Compose/env secrets
   into issues, PRs or logs. Deploy the approved commit/configuration; verify the
   running container's two exact flag values and deployed commit.
3. Sign in and open both entry points. Verify browser setup only, both scopes,
   keyboard navigation, Escape/focus restoration and project starter prompt.
4. Probe all nine worker POST routes directly, including with an existing valid
   bearer token: expect 404. Repeat the hosted Codex OAuth/project/validation/PNG/
   export journey with the matching project tab visible. Confirm grant revocation
   remains usable. Local tests are not this live acceptance.

Disable while workers are idle where possible: the gate also blocks completion,
status and cancellation for outstanding leases. Existing expiry/recovery semantics
remain; do not delete jobs, grants or data as part of this flag change.

Re-enable only after publication, distribution review and supported-client release
acceptance under THE-15. Set the worker flag to `1` while remote MCP remains `1`,
deploy/restart with authorization, then verify both entry points and authenticated
worker validation/PNG/STL/3MF journeys. No migration or OAuth grant reset is needed
for this UI/gating change. Publication and renderer replacement are separate work.

## Verification

Focused tests cover all exact flag values, both real server pages, both integrated
browser entry points, the accessible browser-only dialog, enabled command variants,
and all nine configured API operations. Existing worker controller and OAuth tests
retain authenticated dispatch and security coverage. Run on Node 24.21.0:

```sh
pnpm build:packages
node --test packages/runtime/tests/shared/utils/localWorkerPolicy.util.test.mjs packages/runtime/tests/workerAvailability.integration.test.mjs packages/runtime/tests/features/worker/controllers/*.test.mjs
node --test apps/site/tests/app/connectionAvailability.integration.test.mjs
pnpm test:browser connectToCodex.component connectedApps.component modelWorkspace.component
pnpm verify
```

## Read-only production snapshot — November 2, 2026

Coolify reports the production application healthy, tracking `master`. Its latest
successful deployment is `gxmdqb0qjqfwlaknwwsrho8o` at commit
`935da63734f6178e87914d1d0e6f554d1c046fc4`. The connected token exposes environment
key names, including both flags, but has no environment-value tool. All nine
unauthenticated worker POST probes using curl returned 401. Given the checked
gates in that deployed commit, this indicates both flags are effectively enabled;
it is not a direct read of the container environment. An initial Python HTTP
client received upstream 403 responses and was not used to infer gate state.

No production environment value or deployment was changed. The prepared change is
worker `0`, remote MCP `1`, followed by the authorized rollout and live checks above.
Browser-only production acceptance is pending.
