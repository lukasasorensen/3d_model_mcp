import { isBrowserRendererProvenance } from "@rjls/contracts";
import { connectCadMcpStdio } from "@rjls/mcp";
import { PostgresModelProjectRepository, VALIDATION_POLICY_VERSION } from "@rjls/model-project";
import { resolve } from "node:path";

import { FilesystemBrowserRenderBridge } from "./filesystem-browser-renderer.js";
import { getProjectDatabase } from "./infrastructure.js";

const bridgeRoot = resolve(process.env.RJLS_LOCAL_BRIDGE_ROOT ?? ".rjls-local-bridge");
const ownerId = process.env.RJLS_ACTOR_USER_ID;
if (!ownerId) throw new Error("RJLS_ACTOR_USER_ID is required for the standalone MCP server.");
const database = getProjectDatabase();
const renderer = new FilesystemBrowserRenderBridge(bridgeRoot, VALIDATION_POLICY_VERSION, ownerId);
const repository = new PostgresModelProjectRepository({
  pool: database.pool,
  ownerId,
  renderer,
  acceptRendererProvenance: isBrowserRendererProvenance,
});

try {
  const server = await connectCadMcpStdio(repository);
  process.stderr.write(`rjls-cad MCP ready; actor: ${ownerId}\n`);
  let closing = false;
  const close = async () => {
    if (closing) return;
    closing = true;
    await server.close().catch(() => undefined);
    await database.close().catch(() => undefined);
  };
  process.once("SIGINT", () => { void close(); });
  process.once("SIGTERM", () => { void close(); });
  process.stdin.once("end", () => { void close(); });
} catch (error) {
  await database.close().catch(() => undefined);
  process.stderr.write(`rjls-cad MCP failed to start: ${error instanceof Error ? error.message : "unknown error"}\n`);
  process.exitCode = 1;
}
