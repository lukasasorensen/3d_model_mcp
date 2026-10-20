# Headless renderer proof (THE-16)

This unpublished proof tests the renderer portion of THE-15. It builds the shared browser-renderer
package into a standalone artifact and runs it in sandboxed headless
Chromium. It does not start Next.js, connect to PostgreSQL, or implement the future
MCP worker, OAuth flow, or hosted worker endpoints.

## Source layout

```text
scripts/headless-renderer/
├── build.mjs
├── run-proof.mjs
├── node/
│   ├── renderer/
│   │   └── chromium.mjs
│   └── services/
│       ├── asset-server.mjs
│       └── asset-server.test.mjs
├── browser/
│   ├── renderer/
│   │   └── bridge.mjs
│   └── worker/
│       └── openscad.mjs
└── acceptance/
    ├── renderer.mjs
    └── utils/
        └── png.mjs
```

The root entry points build and run the proof. `node/renderer` owns Chromium
lifecycle; `node/services` owns loopback asset serving with colocated tests.
`browser/renderer` contains the invocation bridge, while `browser/worker` contains
the worker bootstrap. `acceptance/renderer.mjs` owns fixtures and assertions and
uses its named PNG utility for artifact inspection. Folder context supplies the
namespace, so filenames such as `chromium.mjs`, `bridge.mjs`, and `openscad.mjs`
do not repeat it. The build emits `run-proof.mjs` as the standalone artifact's
`cli.mjs`, preserving its existing entry point.

## Run

From the repository root with dependencies installed:

```bash
pnpm exec playwright install chromium --only-shell
pnpm proof:headless-renderer
```

The build prepares the checksum-pinned CAD assets and builds the existing
contracts/codecs. Results go to the ignored `renderer-proof-output/` directory:
PNG views, parsed STL/3MF files, and `report.json` with hashes, byte sizes,
geometry, renderer versions, and timings. The proof exits nonzero on failure.

The browser download is an explicit prerequisite, not a postinstall side effect.
Linux may also need Playwright system dependencies. This run verifies macOS arm64
only; other OS/architecture support is still unverified.

## Verify independence from the checkout

Build first, then pack the generated directory:

```bash
pnpm build:headless-renderer-proof
cd dist/headless-renderer-proof
pnpm pack --pack-destination /tmp/cad-proof-pack
```

Extract that tarball into a new directory outside the repository. In its `package/`
directory run:

```bash
pnpm install --prod --ignore-scripts
pnpm exec playwright install chromium --only-shell
node cli.mjs /tmp/cad-proof-results
```

The artifact contains its bundled harness and CAD assets. Its only declared npm
dependency is pinned Playwright. It needs no workspace symlinks, repository files,
site environment variables, database, native OpenSCAD, visible browser tab, or
hosted application. After dependency/browser installation, rendering uses only
the packaged loopback assets. `cli.mjs` resolves those assets relative to itself,
so the caller's working directory is irrelevant.

This is a private feasibility artifact, not a public distribution. Public package
licensing/notices, supported-platform checks, and npm publishing remain THE-15 work.

## Reuse established by the proof

The initial THE-16 proof bundled the existing site modules without algorithm
changes. THE-17 extracts that code into `@theoryfoundry/browser-renderer`; both the
hosted UI and proof now consume its public entry point.

| Shared module | Reused behavior |
| --- | --- |
| `worker/openscad.ts` | Pinned WASM/BOSL2 verification, virtual filesystem, Manifold compilation, diagnostics |
| `worker/client.ts` | Worker cancellation, timeouts, output limits |
| `services/preview.ts` | Instance-owned STL cache |
| `renderer/png.ts` | Seven camera views, framing, lighting, Three.js PNG generation |
| `utils/mesh-summary.ts` | Browser geometry summaries |
| `services/download.ts` | STL/3MF generation and STL-to-GLB conversion |
| `renderer/provenance.ts` | Existing renderer identity and pins |

The proof no longer imports site renderer files or rewrites a worker URL. Each
host supplies worker construction and asset origin through `createBrowserCadRenderer`;
its small worker entry calls `installOpenScadWorker`. HTTP job completion, source
fetching, and DOM downloads remain in the site. Public `@theoryfoundry/renderer`
codecs still independently parse the results. See the [shared package API](../packages/browser-renderer/README.md).

The new code provides a fixed-asset loopback server, browser lifecycle, an
in-memory invocation bridge, artifact packaging, and a fixture suite. The server
rejects unknown paths, mutation requests, foreign Origin/Host headers, and
cross-site fetches. Chromium runs with its sandbox enabled and SwiftShader for
software WebGL; the existing OpenSCAD worker uses the WASM Manifold backend.

The harness is single-job and fixture-driven. Its checks are not a substitute for
the future worker's authentication, hostile-input hardening, bounded cache/queue,
process supervision, and protocol compatibility.

## Acceptance and observed results

On October 20, 2026, the packed artifact was extracted and installed separately
under `/private/tmp`, then launched from a working directory outside the checkout.
The local run used macOS arm64, Node 26.10.0, Playwright 1.61.1, and headless
Chromium 149.0.7827.55 with SwiftShader. These are measured local results, not
performance guarantees or cross-platform acceptance.

- Browser startup: approximately **0.73 seconds** with the browser already installed.
- Complete fixture suite including startup: approximately **4.30 seconds**.
- Packed artifact: **11,066,593 bytes (10.55 MiB compressed)**, including CAD
  assets and bundled JavaScript but excluding Playwright and its managed browser.
  The downloaded matching headless-shell archive was approximately **93.5 MiB**;
  unpacked browser storage and platform payloads differ.
- Produced **14 artifacts** and a report; the isometric solid PNG was visually inspected.
- STL and ZIP64-compatible 3MF parsers accepted the solid; geometry matched the
  browser summary and expected 30 × 20 × 10 mm bounds.
- All seven 768 × 768 PNG views decoded successfully within the existing 2 MiB limit;
  image data was nonuniform and distinct camera views produced distinct hashes.
- A pinned BOSL2 rounded cuboid compiled and produced a PNG.
- A multi-solid boolean fixture produced more than 1,000 triangles and a PNG.
- Syntax errors remained model failures. Cancelling an in-flight worker returned
  AbortError, and a subsequent render succeeded.
- A mismatched source hash was rejected. Renderer requests targeted packaged
  loopback assets; browser and server close before report completion.

The suite compares geometry against known fixtures and the independent codecs.
It does not compare live hosted UI screenshots or require byte-identical PNGs
across browser/GPU versions. Timings for individual operations are in the report;
PNG views reuse the existing mesh cache after the initial compilation.

Repository validation also passed: `pnpm verify` with an isolated Next build
directory and `git diff --check`. Two existing optional runtime tests were skipped
(performance evidence and externally configured PostgreSQL/stdio integration).
The new loopback server tests passed. Real headless rendering is an explicit
proof command, not a new browser prerequisite for the default test suite.

## What this changes in the larger plan

The current CAD and PNG implementations are reusable without algorithm changes.
The shared rendering package has now been extracted, with the visible browser
and headless worker supplying their own lifecycle adapters. Remaining
substantial work is hosted job coordination, local OAuth/secret storage, a real
MCP entry point, installation/upgrade behavior, and platform/release acceptance.
The existing site's source-hash cache is unbounded; it must be bounded before it
is reused in a long-lived public worker.

## Shared-package extraction verification (THE-17)

The unchanged 14-artifact suite passed through the package API and was rerun from
a freshly packed artifact outside the checkout. On the same machine and browser,
all nine PNGs and four STL files matched the original proof hashes exactly. The
3MF's parsed geometry matched; its XML CreationDate metadata makes its byte hash
vary between runs.
Package tests cover worker/origin injection, per-instance cache isolation,
cancellation, model/operational failures, failed-startup cleanup, explicit worker
bootstrap, and geometry summaries. Boundary tests reject server dependencies in
the browser-safe package. Full `pnpm verify` passed after extraction, with the same
two optional runtime skips. A local production Next.js server also loaded its
actual emitted worker bundle and rendered the BOSL2 fixture into an independently
parsed 236-triangle STL with 12 × 18 × 6 mm bounds. Webpack emits a classic worker;
the proof emits an ES module worker. Both bootstraps call the same package API.
The local server and test browser were stopped after acceptance.
The original THE-16 measurements above remain historical
baseline evidence, not updated performance guarantees.
