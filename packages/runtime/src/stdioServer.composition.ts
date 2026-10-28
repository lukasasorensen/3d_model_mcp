import { isBrowserRendererProvenance } from "@theoryfoundry/contracts";
import { connectCadMcpStdio } from "@theoryfoundry/mcp";
import {
  BrowserPreviewJobsRepository,
  PostgresModelProjectRepository,
  RemoteRenderJobsRepository,
  VALIDATION_POLICY_VERSION,
} from "@theoryfoundry/model-project";
import { RuntimeCadWorkflowService } from "./cadWorkflow.composition.js";
import { getProjectDatabase } from "./database.composition.js";
import { RemoteBrowserRenderer } from "./features/browser-rendering/index.js";
import { PostgresModelPreviewService } from "./modelPreview.composition.js";
const ownerId = process.env.THEORYFOUNDRY_ACTOR_USER_ID;
if (!ownerId)
  throw new Error(
    "THEORYFOUNDRY_ACTOR_USER_ID is required for the standalone MCP server.",
  );
const database = getProjectDatabase();
const renderJobs = new RemoteRenderJobsRepository(
  database.pool,
  ownerId,
  "local-mcp",
);
const renderer = new RemoteBrowserRenderer(
  renderJobs,
  VALIDATION_POLICY_VERSION,
  database.notifications,
);
const repository = new PostgresModelProjectRepository({
  pool: database.pool,
  ownerId,
  renderer,
  acceptRendererProvenance: isBrowserRendererProvenance,
});

try {
  await renderJobs.recover();
  await new BrowserPreviewJobsRepository(database.pool, ownerId).sweep();
  const server = await connectCadMcpStdio(repository, {
    workflowService: new RuntimeCadWorkflowService(
      database,
      repository,
      ownerId,
      "local-mcp",
    ),
    previewService: new PostgresModelPreviewService(
      database,
      repository,
      ownerId,
      "local-mcp",
    ),
  });
  process.stderr.write(`theoryfoundry-cad MCP ready; actor: ${ownerId}\n`);
  let closing = false;
  const close = async (): Promise<void> => {
    if (closing) return;
    closing = true;
    await server.close().catch(() => undefined);
    await database.close().catch(() => undefined);
  };
  process.once("SIGINT", () => {
    void close();
  });
  process.once("SIGTERM", () => {
    void close();
  });
  process.stdin.once("end", () => {
    void close();
  });
} catch (error) {
  await database.close().catch(() => undefined);
  process.stderr.write(
    `theoryfoundry-cad MCP failed to start: ${error instanceof Error ? error.message : "unknown error"}\n`,
  );
  process.exitCode = 1;
}
