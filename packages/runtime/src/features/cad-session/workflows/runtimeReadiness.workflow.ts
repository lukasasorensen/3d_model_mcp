import { CAD_TOOL_NAMES } from "@theoryfoundry/gateway";
import { randomUUID } from "node:crypto";
import { type ConnectedCadMcpClient } from "../../mcp/index.js";
import type { RuntimeObservability } from "../../observability/index.js";
export async function probeConfiguredReadiness(
  client: Pick<ConnectedCadMcpClient, "listTools">,
  databaseProbe: () => Promise<void> = async () => undefined,
): Promise<{ status: "ready"; profile: "browser-wasm" }> {
  const discovered = [...(await client.listTools({}))].sort();
  const expected = [...CAD_TOOL_NAMES].sort();
  if (JSON.stringify(discovered) !== JSON.stringify(expected))
    throw new Error(
      "Official MCP discovery did not expose the exact CAD tool surface.",
    );
  await databaseProbe();
  return { status: "ready", profile: "browser-wasm" };
}

export function createObservedReadinessProbe(
  observability: RuntimeObservability,
  probe: () => Promise<{ status: "ready"; profile: "browser-wasm" }>,
  dependencies: { createId?: () => string; clock?: () => Date } = {},
): () => Promise<{ status: "ready"; profile: "browser-wasm" }> {
  const evidence = observability.createRequestSink();
  const createId = dependencies.createId ?? (() => `readiness-${randomUUID()}`);
  const clock = dependencies.clock ?? (() => new Date());
  return async () => {
    const requestId = createId();
    const timestamp = clock().toISOString();
    let result: { status: "ready"; profile: "browser-wasm" };
    try {
      result = await probe();
    } catch (error) {
      evidence.probeDependency({ available: false, requestId, timestamp });
      throw error;
    }
    if (
      evidence.probeDependency({ available: true, requestId, timestamp }) !==
      "ready"
    )
      throw new Error("Runtime readiness recovery confirmation is pending.");
    return result;
  };
}
