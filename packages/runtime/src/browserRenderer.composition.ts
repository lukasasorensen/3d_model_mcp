import {
  PostgresProjectNotifications,
  type ProjectChangeSource,
} from "@theoryfoundry/model-project";
import type { Pool } from "pg";
import { PostgresBrowserRenderAdapter } from "./features/browser-rendering/index.js";
export class PostgresBrowserRenderCoordinator {
  private readonly implementation: PostgresBrowserRenderAdapter;
  constructor(
    validationPolicyVersion: string,
    pool: Pool,
    ownerId: string,
    changes: ProjectChangeSource = new PostgresProjectNotifications(pool),
  ) {
    this.implementation = new PostgresBrowserRenderAdapter(
      validationPolicyVersion,
      pool,
      ownerId,
      changes,
    );
  }
  subscribe: PostgresBrowserRenderAdapter["subscribe"] = (...args) =>
    this.implementation.subscribe(...args);
  validateAndRender: PostgresBrowserRenderAdapter["validateAndRender"] = (
    ...args
  ) => this.implementation.validateAndRender(...args);
  complete: PostgresBrowserRenderAdapter["complete"] = (...args) =>
    this.implementation.complete(...args);
}
