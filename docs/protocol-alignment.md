# Gateway and MCP alignment

The first [THE-28](https://linear.app/theoryfoundry/issue/THE-28) slice starts
from merged PR #16 (`d150d96`). It organizes the protocol boundary while
preserving package identities, public exports and operator launch paths.

## Ownership

| Previous location                           | Current owner                                                                                                                            |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Gateway `orchestrator.ts`                   | `features/chat/workflows/cadChat.workflow.ts` sequences discovery, bounded tool execution and model streaming                            |
| Gateway event queue and telemetry           | `features/chat/services/chatEvents.service.ts` owns event sequencing, terminal diagnostics and correlated telemetry                      |
| Gateway prompt/output helpers               | Focused `features/chat/utils/` modules own deterministic prompt policy, safe text and structured event projection                        |
| Gateway `provider.ts`                       | `mockCadProvider.service.ts` implements the provider port; root `chat.composition.ts` selects defaults and connects HTTP to the workflow |
| Gateway `http.ts` / `cad-client.ts`         | Chat controller and module-owned options/client/provider contracts                                                                       |
| MCP `tools.ts`                              | `features/cad-tools/` owns registry workflow, invocation controller and tool contracts                                                   |
| MCP `mcp-adapter.ts` / preview registration | Root `mcpServer.composition.ts` registers tools and owns stdio startup; preview admission stays in its focused controller                |
| Runtime `mcp-client.ts`                     | Root `mcpClient.composition.ts` owns connections; `features/mcp/` owns the connected-client contract and protocol response adapter       |

Module indexes only re-export. Root composition imports public feature indexes;
internal files use explicit lower-level imports. Gateway and MCP root indexes
explicitly retain their previous public API rather than exposing every internal
feature export. Runtime consumers use the connected-client port rather than the
composition implementation as a type dependency.

## Preserved behavior and cleanup

- MCP tool names, descriptions, input/output schemas, annotations and public error
  mapping remain stable. Tool context still carries cancellation to execution.
- Chat discovery fails closed; tool/repair limits remain request-local, including
  parallel proposals. Project IDs and causal IDs stay authoritative.
- NDJSON sequencing, bounded UTF-8 output, source/download-link redaction and
  structured revision/artifact/export projection remain covered by regression tests.
- HTTP admission retains exact origin/session checks and bounded body reading.
  Consumer cancellation still propagates to active MCP work.
- Failed MCP client/server startup now closes allocated peers/transports and rethrows
  the startup error even if cleanup itself rejects. Normal shutdown remains explicit.
- SQL, migrations, feature flags, rendering formats and stdio launch commands are unchanged.

## Tests and remaining scope

The original 17 gateway and 7 MCP cases move into `tests/`. Gateway cases are split
by protocol, observability, limits, failures, provider behavior and HTTP admission.
Scenario directories retain the full `cadChat.workflow.test.mjs` stem. Four new
startup/shutdown regressions exercise cleanup ownership and error preservation.
Tests remain outside emitted library output.

Verification includes public value/type export comparison, SDK tool-discovery
comparison, full `pnpm verify`, and disposable PostgreSQL plus compiled stdio
integration. Record current results and exact-head CI in the PR and Linear.

The architecture baseline shrinks from 167 to 144 records; convention records
shrink from 153 to 143. All retained exceptions keep their original identity;
none are retargeted. THE-28 retains 64 architecture records, with 80 for THE-29.

THE-28 remains open for runtime authentication, remote MCP, rendering/preview,
export and worker feature organization, injection and remaining test splits.
Stage 6 follows stage 5 completion. Node 24 is stage 8; deployment and live
acceptance remain separate work.

## Local verification

On 2026-10-27, full Node 22 `pnpm verify` passed from clean gateway/MCP/runtime
output: 78 test files across 9 projects, 264 passed and 3 existing optional skips,
including the production build. Loopback-listener tests required running outside
the restricted shell sandbox. Disposable PostgreSQL 18.6 concurrency and compiled
stdio browser-validation/promotion checks passed separately.

Public export names retain all values and types: MCP 9 exports (5 values), gateway
12 (7 values), runtime 64 (50 values). SDK discovery compares equal to the merged
base, including preview tool metadata and schemas. All 24 original gateway/MCP
cases remain; the four added cases cover resource cleanup. Clean library output
contains no tests. The 144 retained architecture records are unchanged.
