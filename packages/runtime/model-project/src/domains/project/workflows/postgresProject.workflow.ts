import {
  artifactManifestSchema,
  candidateRecordSchema,
  createProjectInputSchema,
  revisionManifestSchema,
  updateProjectInputSchema,
  type CandidateRecord,
  type CreateProjectInput,
  type RevisionManifest,
  type UpdateProjectInput,
} from "@theoryfoundry/contracts";
import { randomUUID } from "node:crypto";
import { assertSourcePolicy } from "../../../shared/utils/sourcePolicy.util.js";
import type { ProjectWorkflowOptions } from "../projectRepository.types.js";
import type { ModelSourceService } from "../services/modelSource.service.js";

import { CadDomainError } from "../../../shared/utils/cadDomainError.util.js";
import { assertArtifactSet } from "../../../shared/utils/renderPolicy.util.js";
import { VALIDATION_POLICY_VERSION } from "../../../shared/validation.constants.js";
import type { ProjectState, ProjectSummary } from "../project.types.js";
import type { ProjectPersistence } from "../projectPersistence.port.js";
import type { ModelProjectStore } from "../projectStore.port.js";
import type { CandidateValidationService } from "../services/candidateValidation.service.js";

/** Coordinates domain workflows while delegating all SQL and row hydration to PostgreSQL persistence. */
export class PostgresProjectWorkflow implements ModelProjectStore {
  private readonly clock: () => Date;
  private readonly createId: () => string;
  private readonly persistence: ProjectPersistence;
  private readonly validationPolicyVersion: string;

  constructor(
    private readonly options: ProjectWorkflowOptions,
    persistence: ProjectPersistence,
    private readonly validation: CandidateValidationService,
    private readonly sources: ModelSourceService,
  ) {
    this.clock = options.clock ?? ((): Date => new Date());
    this.createId = options.createId ?? randomUUID;
    this.persistence = persistence;
    this.validationPolicyVersion =
      options.validationPolicyVersion ?? VALIDATION_POLICY_VERSION;
  }

  async createProject(input: CreateProjectInput): Promise<ProjectSummary> {
    return this.persistence.createProject(
      this.createProjectId(),
      createProjectInputSchema.parse(input),
    );
  }

  async updateProject(input: UpdateProjectInput): Promise<ProjectSummary> {
    return this.persistence.updateProject(
      updateProjectInputSchema.parse(input),
    );
  }

  async listProjects(): Promise<ProjectSummary[]> {
    return this.persistence.listProjects();
  }

  async getProjectState(projectId: string): Promise<ProjectState> {
    const project = await this.persistence.requireProject(projectId);
    if (!project.currentRevision)
      return {
        projectId,
        currentRevision: null,
        source: null,
        artifacts: [],
        diagnostics: [],
      };
    const { manifest } = await this.persistence.readRevision(
      projectId,
      project.currentRevision,
    );
    return {
      projectId,
      currentRevision: manifest.revisionId,
      source: { hash: manifest.sourceHash, byteSize: manifest.sourceBytes },
      artifacts: manifest.artifacts,
      diagnostics: manifest.diagnostics,
    };
  }

  async assertProjectAccess(projectId: string): Promise<void> {
    await this.persistence.requireProject(projectId);
  }

  async getProjectSnapshot(
    projectId: string,
  ): Promise<{ state: ProjectState; revisions: RevisionManifest[] }> {
    return this.persistence.transaction(async (transaction) => {
      const project = await transaction.requireProject(projectId, true);
      const revisions = project.currentRevision
        ? await transaction.listRevisionHistory(
            projectId,
            project.currentRevision,
          )
        : [];
      const current = revisions[0];
      return {
        state: current
          ? {
              projectId,
              currentRevision: current.revisionId,
              source: {
                hash: current.sourceHash,
                byteSize: current.sourceBytes,
              },
              artifacts: current.artifacts,
              diagnostics: current.diagnostics,
            }
          : {
              projectId,
              currentRevision: null,
              source: null,
              artifacts: [],
              diagnostics: [],
            },
        revisions,
      };
    });
  }

  async getCandidate(
    projectId: string,
    candidateId: string,
  ): Promise<CandidateRecord> {
    return (await this.persistence.readCandidate(projectId, candidateId))
      .candidate;
  }

  async readValidatedCandidateSource(
    projectId: string,
    candidateId: string,
  ): Promise<{ candidateId: string; source: string; sourceHash: string }> {
    return this.sources.readValidatedCandidateSource(projectId, candidateId);
  }
  async readModelSource(
    projectId: string,
    revision?: string,
  ): Promise<{ revision: string; source: string; sourceHash: string }> {
    return this.sources.readModelSource(projectId, revision);
  }

  async listRevisions(projectId: string): Promise<RevisionManifest[]> {
    const project = await this.persistence.requireProject(projectId);
    return project.currentRevision
      ? this.persistence.listRevisionHistory(projectId, project.currentRevision)
      : [];
  }

  async proposeModelSource(input: {
    projectId: string;
    parentRevision: string | null;
    source: string;
    requestId: string;
    toolCallId: string;
  }): Promise<CandidateRecord> {
    assertSourcePolicy(input.source);
    const candidateId = this.createCandidateId();
    await this.persistence.transaction(async (transaction) => {
      const project = await transaction.requireProject(input.projectId, true);
      if (project.currentRevision !== input.parentRevision) {
        throw new CadDomainError(
          "STALE_REVISION",
          "Candidate parent is not the current revision.",
          {
            expected: project.currentRevision,
            received: input.parentRevision,
          },
        );
      }
      await transaction.insertCandidate({
        id: candidateId,
        projectId: input.projectId,
        parentRevision: input.parentRevision,
        source: input.source,
        requestId: input.requestId,
        toolCallId: input.toolCallId,
        createdAt: this.clock(),
      });
    });
    return (await this.persistence.readCandidate(input.projectId, candidateId))
      .candidate;
  }

  async validateAndRender(input: {
    projectId: string;
    candidateId: string;
    previewProfile: "standard";
    signal?: AbortSignal;
  }): Promise<CandidateRecord> {
    if (input.signal?.aborted)
      throw new CadDomainError("CANCELLED", "Operation cancelled.");
    const validation = this.validation;
    const claimed = await this.persistence.transaction((transaction) =>
      validation.begin(transaction, input),
    );
    if (!claimed.attemptId) return claimed.candidate;
    let rawResult: unknown;
    let operationalError: CadDomainError | undefined;
    try {
      rawResult = await this.options.renderer.validateAndRender({
        ...input,
        attemptId: claimed.attemptId,
        source: claimed.source,
        sourceHash: claimed.candidate.sourceHash,
      });
      if (input.signal?.aborted)
        throw new CadDomainError("CANCELLED", "Rendering was cancelled.");
    } catch (error) {
      operationalError =
        error instanceof CadDomainError
          ? new CadDomainError(error.code, error.message, {
              retryable: true,
              ...error.details,
            })
          : new CadDomainError(
              input.signal?.aborted ? "CANCELLED" : "RENDER_FAILED",
              "Validation could not complete; retry the same candidate.",
              { retryable: true },
            );
    }
    const result = await this.persistence.transaction((transaction) =>
      validation.complete(transaction, {
        projectId: input.projectId,
        candidateId: input.candidateId,
        attemptId: claimed.attemptId!,
        sourceHash: claimed.candidate.sourceHash,
        rawResult,
        error: operationalError,
      }),
    );
    if (result.error) throw result.error;
    return result.candidate;
  }

  async promoteCandidate(input: {
    projectId: string;
    candidateId: string;
    expectedParentRevision: string | null;
    signal?: AbortSignal;
  }): Promise<RevisionManifest> {
    if (input.signal?.aborted)
      throw new CadDomainError("CANCELLED", "Operation cancelled.");
    let staleCurrentRevision: string | null | undefined;
    const manifest = await this.persistence.transaction(async (transaction) => {
      const project = await transaction.requireProject(input.projectId, true);
      const persistedCandidate = await transaction.readCandidate(
        input.projectId,
        input.candidateId,
        true,
      );
      const candidate = persistedCandidate.candidate;
      if (candidate.state !== "VALID")
        throw new CadDomainError(
          "INVALID_CANDIDATE_STATE",
          "Only a validated candidate can be promoted.",
        );
      if (
        project.currentRevision !== input.expectedParentRevision ||
        candidate.parentRevision !== input.expectedParentRevision
      ) {
        await transaction.supersedeCandidate(input.candidateId, this.clock());
        staleCurrentRevision = project.currentRevision;
        return undefined;
      }
      this.assertApprovedProvenance(candidate);
      assertArtifactSet(
        candidate.artifacts,
        candidate.sourceHash,
        candidate.renderer!,
      );
      const revisionId = this.createRevisionId();
      const createdAt = this.clock();
      await transaction.insertRevision({
        id: revisionId,
        projectId: input.projectId,
        parentRevision: project.currentRevision,
        source: persistedCandidate.source,
        sourceHash: candidate.sourceHash,
        sourceBytes: candidate.sourceBytes,
        requestId: candidate.requestId,
        toolCallId: candidate.toolCallId,
        candidateId: candidate.candidateId,
        validationPolicyVersion: this.validationPolicyVersion,
        diagnostics: candidate.diagnostics,
        renderer: candidate.renderer!,
        geometry: candidate.geometry,
        createdAt,
      });
      const revisionArtifacts = candidate.artifacts.map((artifact) =>
        artifactManifestSchema.parse({
          ...artifact,
          sourceRevision: revisionId,
        }),
      );
      await transaction.insertRevisionArtifacts(revisionId, revisionArtifacts);
      await transaction.advanceCurrentRevision(
        input.projectId,
        revisionId,
        createdAt,
      );
      await transaction.markCandidatePromoted(input.candidateId, createdAt);
      return (await transaction.readRevision(input.projectId, revisionId))
        .manifest;
    });
    if (!manifest) {
      throw new CadDomainError(
        "STALE_REVISION",
        "The current revision changed before promotion.",
        { current: staleCurrentRevision ?? null },
      );
    }
    return manifest;
  }

  async getExportMetadata(
    projectId: string,
    revision: string,
    format: "3mf",
  ): Promise<{
    revision: string;
    source: string;
    sourceHash: string;
    format: "3mf";
  }> {
    const project = await this.persistence.requireProject(projectId);
    if (!project.currentRevision)
      throw new CadDomainError(
        "PROJECT_NOT_FOUND",
        "Project has no current revision.",
      );
    if (project.currentRevision !== revision) {
      throw new CadDomainError(
        "STALE_REVISION",
        "Exports are available only for the current revision.",
        { current: project.currentRevision },
      );
    }
    return { ...(await this.readModelSource(projectId, revision)), format };
  }

  async restoreRevision(input: {
    projectId: string;
    revision: string;
    requestId: string;
    toolCallId: string;
    signal?: AbortSignal;
  }): Promise<RevisionManifest> {
    if (input.signal?.aborted)
      throw new CadDomainError("CANCELLED", "Operation cancelled.");
    return this.persistence.transaction(async (transaction) => {
      const project = await transaction.requireProject(input.projectId, true);
      if (!project.currentRevision)
        throw new CadDomainError(
          "PROJECT_NOT_FOUND",
          "Project has no revision to restore from.",
        );
      const target = await transaction.readRevision(
        input.projectId,
        input.revision,
        true,
      );
      this.assertApprovedProvenance(target.manifest);
      const revisionId = this.createRevisionId();
      const createdAt = this.clock();
      await transaction.insertRevision({
        id: revisionId,
        projectId: input.projectId,
        parentRevision: project.currentRevision,
        restoredFromRevision: input.revision,
        source: target.source,
        sourceHash: target.manifest.sourceHash,
        sourceBytes: target.manifest.sourceBytes,
        requestId: input.requestId,
        toolCallId: input.toolCallId,
        candidateId: `restore-${this.createCandidateId()}`,
        validationPolicyVersion: this.validationPolicyVersion,
        diagnostics: target.manifest.diagnostics,
        renderer: target.manifest.renderer,
        geometry: target.manifest.geometry,
        createdAt,
      });
      const restoredArtifacts = target.manifest.artifacts.map((artifact) =>
        artifactManifestSchema.parse({
          ...artifact,
          sourceRevision: revisionId,
        }),
      );
      await transaction.restoreRevisionArtifacts(
        revisionId,
        input.revision,
        restoredArtifacts,
      );
      await transaction.advanceCurrentRevision(
        input.projectId,
        revisionId,
        createdAt,
      );
      return (await transaction.readRevision(input.projectId, revisionId))
        .manifest;
    });
  }

  private assertApprovedProvenance(
    record: Pick<
      CandidateRecord | RevisionManifest,
      "validationPolicyVersion" | "renderer"
    >,
  ): void {
    if (
      !record.renderer ||
      record.validationPolicyVersion !== this.validationPolicyVersion ||
      record.renderer.validationPolicyVersion !==
        this.validationPolicyVersion ||
      !this.options.acceptRendererProvenance(record.renderer)
    ) {
      throw new CadDomainError(
        "PROVENANCE_MISMATCH",
        "Renderer provenance is missing or mismatched.",
      );
    }
  }

  private createProjectId(): string {
    return this.createValidatedId(candidateRecordSchema.shape.projectId);
  }

  private createCandidateId(): string {
    return this.createValidatedId(candidateRecordSchema.shape.candidateId);
  }

  private createRevisionId(): string {
    return this.createValidatedId(revisionManifestSchema.shape.revisionId);
  }

  private createValidatedId(schema: { parse(value: unknown): string }): string {
    return schema.parse(this.createId());
  }
}
