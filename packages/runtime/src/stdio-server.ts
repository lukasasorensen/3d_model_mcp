import { isBrowserRendererProvenance } from "@rjls/contracts";
import { connectCadMcpStdio } from "@rjls/mcp";
import { ModelProjectRepository, VALIDATION_POLICY_VERSION } from "@rjls/model-project";
import { resolve } from "node:path";

import { FilesystemBrowserRenderBridge } from "./filesystem-browser-renderer.js";

const workspaceRoot = resolve(process.env.RJLS_PROJECTS_ROOT ?? ".rjls-projects");
const renderer = new FilesystemBrowserRenderBridge(workspaceRoot, VALIDATION_POLICY_VERSION);
const repository = new ModelProjectRepository({
  workspaceRoot,
  renderer,
  acceptRendererProvenance: isBrowserRendererProvenance,
});

try {
  const server = await connectCadMcpStdio(repository);
  process.stderr.write(`rjls-cad MCP ready; projects root: ${workspaceRoot}\n`);
  let closing = false;
  const close = async () => {
    if (closing) return;
    closing = true;
    await server.close().catch(() => undefined);
  };
  process.once("SIGINT", () => { void close(); });
  process.once("SIGTERM", () => { void close(); });
  process.stdin.once("end", () => { void close(); });
} catch (error) {
  process.stderr.write(`rjls-cad MCP failed to start: ${error instanceof Error ? error.message : "unknown error"}\n`);
  process.exitCode = 1;
}
