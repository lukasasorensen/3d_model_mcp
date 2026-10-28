import {
  BrowserPresenceRepository,
  BrowserPreviewJobsRepository,
  type ModelProjectStore,
  type ProjectDatabase,
} from "@theoryfoundry/model-project";
import { ModelPreviewWorkflow } from "./features/model-preview/index.js";
import { remoteMcpIdentity } from "./shared/utils/remoteMcpPolicy.util.js";
export class PostgresModelPreviewService {
  private readonly implementation: ModelPreviewWorkflow;
  constructor(
    database: ProjectDatabase,
    repository: ModelProjectStore,
    ownerId: string,
    mode: "local-mcp" | "remote-mcp",
  ) {
    this.implementation = new ModelPreviewWorkflow(
      database.notifications,
      repository,
      ownerId,
      mode,
      new BrowserPreviewJobsRepository(database.pool, ownerId),
      new BrowserPresenceRepository(database.pool, ownerId),
      () => remoteMcpIdentity().origin,
    );
  }
  getPreview: ModelPreviewWorkflow["getPreview"] = (...args) =>
    this.implementation.getPreview(...args);
}
