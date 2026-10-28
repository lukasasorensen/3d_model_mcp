import {
  RemoteRenderJobsRepository,
  type ProjectDatabase,
} from "@theoryfoundry/model-project";
import { PostgresBrowserRenderCoordinator } from "./browserRenderer.composition.js";
import { LocalBrowserRendererAdapter } from "./features/browser-rendering/index.js";
export class LocalBrowserRenderer {
  private readonly implementation: LocalBrowserRendererAdapter;
  constructor(
    database: ProjectDatabase,
    ownerId: string,
    validationPolicyVersion: string,
  ) {
    this.implementation = new LocalBrowserRendererAdapter(
      new RemoteRenderJobsRepository(database.pool, ownerId, "local-mcp"),
      new PostgresBrowserRenderCoordinator(
        validationPolicyVersion,
        database.pool,
        ownerId,
        database.notifications,
      ),
    );
  }
  claimNext: LocalBrowserRendererAdapter["claimNext"] = (...args) =>
    this.implementation.claimNext(...args);
  complete: LocalBrowserRendererAdapter["complete"] = (...args) =>
    this.implementation.complete(...args);
}
