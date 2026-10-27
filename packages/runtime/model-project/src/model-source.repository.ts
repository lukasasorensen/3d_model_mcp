import type { Pool } from "pg";
import { CadDomainError } from "./shared/utils/cadDomainError.util.js";
import { PostgresProjectPersistence } from "./postgres-project-persistence.js";

/** Owner-scoped source reads independent of rendering and job orchestration. */
export class ModelSourceRepository {
  private readonly persistence: PostgresProjectPersistence;

  constructor(pool: Pool, ownerId: string) {
    if (!ownerId) throw new Error("A repository owner is required.");
    this.persistence = new PostgresProjectPersistence(pool, ownerId);
  }

  async readValidatedCandidateSource(projectId: string, candidateId: string) {
    const { candidate, source } = await this.persistence.readCandidate(
      projectId,
      candidateId,
    );
    if (candidate.state !== "VALID")
      throw new CadDomainError(
        "INVALID_CANDIDATE_STATE",
        "Validate the candidate before requesting a preview.",
      );
    return { candidateId, source, sourceHash: candidate.sourceHash };
  }

  async readModelSource(projectId: string, revision?: string) {
    const project = await this.persistence.requireProject(projectId);
    const selectedRevision = revision ?? project.currentRevision;
    if (!selectedRevision)
      throw new CadDomainError(
        "PROJECT_NOT_FOUND",
        "Project has no current revision.",
      );
    const persistedRevision = await this.persistence.readRevision(
      projectId,
      selectedRevision,
    );
    return {
      revision: selectedRevision,
      source: persistedRevision.source,
      sourceHash: persistedRevision.manifest.sourceHash,
    };
  }
}
