# Worker live acceptance evidence

October 29–30, 2026; THE-15 remains In Progress. This records a local release
candidate against production, not an npm release. First-release scope is Codex on
Apple Silicon macOS with Node 24. Claude acceptance is deferred to THE-33 and other
platforms to THE-32. THE-9 retains broader browser acceptance.

## Candidate and environment

- macOS 27.0.1, Apple Silicon, Node 24.21.0; Codex CLI 0.164.0.
- `@tfoundry/local-worker@0.1.0-rc.1`, built from clean commit
  `d2dee202e4586a310cd2fb3476d5816de847c80b` on PR #27.
- Tarball: 10,945,311 bytes, 17 files. SHA-256:
  `87900eae6613cab6ad82c9d0e570ecad8c14c03f13c1d613281c771e33edc097`.
- Installed outside the repository in a disposable directory. The stdio command
  used that installation with the normal native Keychain and verified user cache.
  No registry-delivery claim is made.
- Origin: `https://3dai.theoryfoundry.com`; deployed app revision
  `a2ef333108522b4cf68885c1501bea324fda4f9b` (PR #28).

The tarball predates this documentation update. Before publication, build and
inspect a candidate from the final reviewed commit and repeat its acceptance;
never relabel this digest as evidence for a rebuilt tarball.

## Native authentication

Browser OAuth completed against the dedicated worker public client with PKCE.
Credentials were stored successfully in the normal macOS Keychain. A fresh
`doctor` process and two concurrent processes obtained verified hosted tokens,
exercising restart and coordinated refresh rotation.

On October 30, the packaged `logout` command removed the native Keychain entry.
An attempted refresh with the revoked token returned HTTP 400 `invalid_grant`.
The test held the token only in memory and recorded only status and error code.
Login was then restored through normal browser OAuth; another `doctor` run passed
renderer, native binding and authenticated account checks.

The separate Connected Apps grant revocation check also passed on October 30 at
16:32 UTC. The authenticated browser listed `TheoryFoundry Local Worker`; revoking
it changed the page to `No connected apps`. A token that had just initialized MCP
successfully (HTTP 200) was rejected with HTTP 401 while still unexpired. Its
refresh token returned HTTP 400 `invalid_grant`; a fresh authentication instance
returned `LOGIN_REQUIRED` and removed the stale native Keychain credential.
Tokens remained only in memory throughout the probe. The owner then approved a
new browser OAuth grant; packaged `doctor` passed again, restoring worker access.

## Real Codex journey

Codex ran with the user's existing model configuration, isolated acceptance MCP
settings and only worker tools. The new acceptance project's browser tab was not
opened during the journey.

- Project: `bd52b95f-6ddd-4904-abec-af45530fc243`, named
  `THE-15 acceptance — Codex — 2026-10-29`.
- Promoted revision: `0ac2f3b0-a209-44bf-a23a-36646967d0aa`.
- Create/state read → propose → validate `VALID` → PNG → promote → source/revision
  read → STL and 3MF export succeeded through actual Codex MCP tool calls.
- Codex described the returned PNG's slab, left circular hole, upright right post
  and dark green background correctly. The extracted 768 × 768 PNG was visually
  checked. This establishes image consumption in the CLI journey, not graphical
  Codex application display.
- Invalid source `cube([);` was rejected without changing the promoted revision.
- Reading source before the first promotion correctly returned `PROJECT_NOT_FOUND`;
  the continuation used project state until promotion, then read source successfully.

The source was:

```scad
difference(){cube([30,20,6]); translate([10,10,-1]) cylinder(h=8,r=3,$fn=48);} translate([24,10,6]) cylinder(h=8,r=3,$fn=48);
```

Downloaded exports matched their receipt hashes and passed geometry parsing. Both
contained 400 triangles with bounds `[0,0,0]` to `[30,20,14]`.

| Format |  Bytes | SHA-256                                                            |
| ------ | -----: | ------------------------------------------------------------------ |
| STL    | 20,084 | `c1c3ca0be6644144f92468aecf6440d94e2df8f00b0f8ed3e3ac58618928299c` |
| 3MF    |  6,277 | `49f8b42a6306120a08afa19df80d939048d2ed856ea6448a8628091e114116cf` |

On October 30 the owner signed into Chrome, after completion of the tab-closed
Codex journey. The hosted project showed `R1`, `Current revision`, the exact
revision UUID above, matching OpenSCAD source and 30 × 20 × 14 mm bounds. A visual
screenshot confirmed the slab, hole and post in the 3D viewer. The accessibility
tree included a WebGL fallback string even while the canvas rendered; it was not
treated as proof of a rendering failure. This establishes saved-revision visibility,
not THE-9's complete production browser/render/export acceptance. Export bearer
URLs, OAuth credentials and raw private client logs are excluded from this record.

## Cancellation and network recovery

An MCP SDK harness drove the unchanged, externally installed candidate against
production project `eb4a763b-f1c6-489d-92e3-d9d79060a423`, named
`THE-15 acceptance — fault recovery — 2026-10-30`. A test-only Node preloader
intercepted this worker's fetch calls to inject faults and capture whitelisted
status fields. It did not interrupt the deployment or other clients.

- Cancelled validation after hosted lease acquisition. The cancel endpoint
  returned HTTP 200, state `CANCELLED`, for job
  `worker-d8646279-51d2-470c-b7e5-26c1c38dc145`.
- Validated the same candidate successfully on retry: `COMPLETED`, `VALID`, job
  `worker-c7f4dcc5-33c6-4809-9e18-6f6e998dbe41`.
- Simulated an unavailable network for a project-state request; it failed safely.
  Restoring connectivity let the same worker process read state successfully.
- Discarded a successful validation completion response. The worker recovered
  authoritative `COMPLETED`, `VALID` status for job
  `worker-fe0d1b0c-b677-4aba-b5d8-6565afe17c78`.
- Closed the MCP client/transport. OS inspection confirmed the worker PID exited
  and no OAuth callback listener remained on port 43827.

An additional run promoted revision `b6471485-acca-4800-a2fc-aacfe346c325` in that
fault-recovery project and exercised exports:

- Cancelled an active 3MF export; job
  `export-b3ffca8e-ee08-40a9-a0d8-3e9af0de3f5b` returned `CANCELLED`.
- Retried the same revision successfully; job
  `export-cc7379fb-7cd8-4933-973e-72d64dcc7c00` returned `COMPLETED`.
- Closed stdio during an STL export; job
  `export-750e330f-fe5d-4dc4-ae35-5cb7e767ba46` returned `CANCELLED`.
- OS process-table checks confirmed all nine observed worker/descendant processes
  exited after shutdown, including the renderer processes.

This is protocol-level cancellation, stdio shutdown and fault injection, not a
Codex UI stop-button or forced OS kill test. The cancellation endpoints confirmed
terminal lease states; no broader crash-recovery claim is made.

## Measurements and remaining gates

On October 30, `pnpm verify` passed on the release-acceptance branch, including the
workspace tests, type checks, build, lint, formatting and architecture checks.
Formatting and conventions were rerun after the final evidence-only edits and
passed. This is local verification; check the current PR head's CI separately.

Earlier external packed acceptance measured cold setup at 13.795 seconds and warm
setup at 1.427 seconds. The successful Codex continuation took about 70 seconds,
including model reasoning and tool calls. The validation fault harness took 4.419
seconds; the export cancellation/retry/shutdown run took 6.168 seconds. These are
different workloads, not render benchmarks.

During the export run, 26 process-table samples at a requested 200 ms interval
observed nine worker/descendant processes. Peak sampled aggregate RSS was 743.98 MiB;
peak summed `ps` CPU was 134.9%. RSS can count shared pages repeatedly, `ps` CPU is
an OS statistic rather than interval utilization, and sampling can miss peaks.
The trace captured eight validation/export endpoint responses, all HTTP 200; it
does not count OAuth, MCP or every hosted request. Hosted CPU, database writes and
aggregate request durations remain unavailable. No savings claim is supported.

Claude Code 2.1.310 connected to the worker but stopped before CAD tools because
its account had insufficient credit. The owner deferred that journey to THE-33;
it is not a first-release blocker and no verified Claude support is claimed.

Remaining first-release gates:

1. Review and explicitly authorize merges of PR #26 and PR #27; verify resulting
   deployment and build the final candidate from the reviewed release commit.
2. Resolve matching OpenSCAD source/build delivery and compatibility with the
   owner's proprietary TheoryFoundry requirement. See the
   [source audit](worker-source-audit.md); publication is blocked on this.
3. Publish the tested public prerelease, verify exact registry bytes and both
   anonymous/authenticated download, repeat Codex acceptance from npm, then build,
   test, publish and verify `0.1.0` as described in the [release procedure](worker-release.md).
