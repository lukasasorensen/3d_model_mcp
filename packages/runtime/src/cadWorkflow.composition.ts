import {
  BrowserPresenceRepository,
  ModelExportsRepository,
  RemoteRenderJobsRepository,
  type ModelProjectStore,
  type ProjectDatabase,
} from "@theoryfoundry/model-project";
import { createExportFileStore } from "./exportFileStore.composition.js";
import { RuntimeCadWorkflow } from "./features/cad-session/index.js";
import { ModelExportService } from "./modelExport.composition.js";
import { remoteMcpIdentity } from "./shared/utils/remoteMcpPolicy.util.js";
export function createModelExportService(database: ProjectDatabase) {
  return new ModelExportService(database, createExportFileStore());
}
export class RuntimeCadWorkflowService {
  private readonly implementation: RuntimeCadWorkflow;
  constructor(
    database: ProjectDatabase,
    repository: ModelProjectStore,
    ownerId: string,
    mode: "local-mcp" | "remote-mcp" | "chat",
    origin = remoteMcpIdentity().origin,
    exports = createModelExportService(database),
  ) {
    this.implementation = new RuntimeCadWorkflow(
      repository,
      ownerId,
      mode,
      origin,
      exports,
      new RemoteRenderJobsRepository(
        database.pool,
        ownerId,
        mode === "chat" ? "local-mcp" : mode,
      ),
      new BrowserPresenceRepository(database.pool, ownerId),
      new ModelExportsRepository(database.pool, ownerId),
    );
  }
  projectUrl: RuntimeCadWorkflow["projectUrl"] = (...args) =>
    this.implementation.projectUrl(...args);
  inspect: RuntimeCadWorkflow["inspect"] = (...args) =>
    this.implementation.inspect(...args);
  requireReady: RuntimeCadWorkflow["requireReady"] = (...args) =>
    this.implementation.requireReady(...args);
  exportModel: RuntimeCadWorkflow["exportModel"] = (...args) =>
    this.implementation.exportModel(...args);
}
