import type { Pool } from "pg";
import { ModelSourceService } from "./domains/project/index.js";
import { PostgresProjectPersistence } from "./infrastructure/index.js";
export class ModelSourceRepository {
  private readonly sources: ModelSourceService;
  constructor(pool: Pool, ownerId: string) {
    if (!ownerId) throw new Error("A repository owner is required.");
    this.sources = new ModelSourceService(
      new PostgresProjectPersistence(pool, ownerId),
    );
  }
  readModelSource: ModelSourceService["readModelSource"] = (...args) =>
    this.sources.readModelSource(...args);
  readValidatedCandidateSource: ModelSourceService["readValidatedCandidateSource"] =
    (...args) => this.sources.readValidatedCandidateSource(...args);
}
