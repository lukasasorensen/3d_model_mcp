import { CadDomainError } from "../../../shared/utils/cadDomainError.util.js";
import type { ProjectPersistence } from "../projectPersistence.port.js";

/** Owner-scoped source reads independent of rendering and job orchestration. */
export class ModelSourceService {
  constructor(
    private readonly persistence: Pick<
      ProjectPersistence,
      "readCandidate" | "requireProject" | "readRevision"
    >,
  ) {}
  async readValidatedCandidateSource(
    projectId: string,
    candidateId: string,
  ): Promise<{ candidateId: string; source: string; sourceHash: string }> {
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

  async readModelSource(
    projectId: string,
    revision?: string,
  ): Promise<{ revision: string; source: string; sourceHash: string }> {
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
