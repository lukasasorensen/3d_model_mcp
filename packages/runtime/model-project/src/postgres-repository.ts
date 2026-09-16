import {
  createProjectInputSchema,
  updateProjectInputSchema,
  type CreateProjectInput,
  type UpdateProjectInput,
  artifactManifestSchema,
  candidateRecordSchema,
  revisionManifestSchema,
  type CadRenderer,
  type CandidateRecord,
  type Diagnostic,
  type RendererProvenance,
  type RevisionManifest,
} from "@rjls/contracts";
import { randomUUID } from "node:crypto";
import type { Pool } from "pg";

import { CadDomainError } from "./cad-domain-error.js";
import { sha256 } from "./hash.js";
import { PostgresProjectPersistence } from "./postgres-project-persistence.js";
import type { ProjectState, ProjectSummary } from "./project-types.js";
import { assertArtifactSet, evaluateRenderResult } from "./render-policy.js";
import {
  VALIDATION_POLICY_VERSION,
  assertSourcePolicy,
} from "./repository.js";
import type { ModelProjectStore } from "./store.js";

export interface PostgresModelProjectRepositoryOptions {
  pool: Pool;
  ownerId: string;
  renderer: CadRenderer;
  acceptRendererProvenance: (provenance: RendererProvenance) => boolean;
  clock?: () => Date;
  createId?: () => string;
  validationPolicyVersion?: string;
}

/** Coordinates domain workflows while delegating all SQL and row hydration to PostgreSQL persistence. */
export class PostgresModelProjectRepository implements ModelProjectStore {
  private readonly clock: () => Date;
  private readonly createId: () => string;
  private readonly persistence: PostgresProjectPersistence;
  private readonly validationPolicyVersion: string;

  constructor(private readonly options: PostgresModelProjectRepositoryOptions) {
    if (!options.ownerId) throw new Error("A repository owner is required.");
    this.clock = options.clock ?? (() => new Date());
    this.createId = options.createId ?? randomUUID;
    this.persistence = new PostgresProjectPersistence(options.pool, options.ownerId);
    this.validationPolicyVersion = options.validationPolicyVersion ?? VALIDATION_POLICY_VERSION;
  }

  async createProject(input: CreateProjectInput): Promise<ProjectSummary> {
    return this.persistence.createProject(this.createProjectId(), createProjectInputSchema.parse(input));
  }

  async updateProject(input: UpdateProjectInput): Promise<ProjectSummary> {
    return this.persistence.updateProject(updateProjectInputSchema.parse(input));
  }

  async listProjects(): Promise<ProjectSummary[]> {
    return this.persistence.listProjects();
  }

  async getProjectState(projectId: string): Promise<ProjectState> {
    const project = await this.persistence.requireProject(projectId);
    if (!project.currentRevision) return { projectId, currentRevision: null, source: null, artifacts: [], diagnostics: [] };
    const { manifest } = await this.persistence.readRevision(projectId, project.currentRevision);
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

  async getProjectSnapshot(projectId: string): Promise<{ state: ProjectState; revisions: RevisionManifest[] }> {
    return this.persistence.transaction(async (transaction) => {
      const project = await transaction.requireProject(projectId, true);
      const revisions = project.currentRevision ? await transaction.listRevisionHistory(projectId, project.currentRevision) : [];
      const current = revisions[0];
      return { state: current ? {
        projectId, currentRevision: current.revisionId,
        source: { hash: current.sourceHash, byteSize: current.sourceBytes },
        artifacts: current.artifacts, diagnostics: current.diagnostics,
      } : { projectId, currentRevision: null, source: null, artifacts: [], diagnostics: [] }, revisions };
    });
  }

  async readValidatedCandidateSource(projectId: string, candidateId: string) {
    await this.persistence.requireProject(projectId);
    const { candidate, source } = await this.persistence.readCandidate(projectId, candidateId);
    if (candidate.state !== "VALID") throw new CadDomainError("INVALID_CANDIDATE_STATE", "Validate the candidate before requesting a preview.");
    return { candidateId, source, sourceHash: candidate.sourceHash };
  }

  async readModelSource(projectId: string, revision?: string): Promise<{ revision: string; source: string; sourceHash: string }> {
    const project = await this.persistence.requireProject(projectId);
    const selectedRevision = revision ?? project.currentRevision;
    if (!selectedRevision) throw new CadDomainError("PROJECT_NOT_FOUND", "Project has no current revision.");
    const persistedRevision = await this.persistence.readRevision(projectId, selectedRevision);
    return { revision: selectedRevision, source: persistedRevision.source, sourceHash: persistedRevision.manifest.sourceHash };
  }

  async listRevisions(projectId: string): Promise<RevisionManifest[]> {
    const project = await this.persistence.requireProject(projectId);
    return project.currentRevision ? this.persistence.listRevisionHistory(projectId, project.currentRevision) : [];
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
        throw new CadDomainError("STALE_REVISION", "Candidate parent is not the current revision.", {
          expected: project.currentRevision,
          received: input.parentRevision,
        });
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
    return (await this.persistence.readCandidate(input.projectId, candidateId)).candidate;
  }

  async validateAndRender(input: {
    projectId: string;
    candidateId: string;
    previewProfile: "standard";
    signal?: AbortSignal;
  }): Promise<CandidateRecord> {
    if (input.signal?.aborted) throw new CadDomainError("CANCELLED", "Operation cancelled.");
    const claimed = await this.persistence.transaction(async (transaction) => {
      const persistedCandidate = await transaction.readCandidate(input.projectId, input.candidateId, true);
      if (persistedCandidate.candidate.state !== "CREATED") {
        throw new CadDomainError("INVALID_CANDIDATE_STATE", "Only a created candidate can be rendered.");
      }
      const updatedAt = this.clock();
      await transaction.markCandidateRunning(input.candidateId, updatedAt);
      return {
        ...persistedCandidate,
        candidate: { ...persistedCandidate.candidate, state: "RUNNING" as const, updatedAt: updatedAt.toISOString() },
      };
    });

    let state: "VALID" | "REJECTED" = "REJECTED";
    let diagnostics: Diagnostic[] = claimed.candidate.diagnostics;
    let renderer: RendererProvenance | undefined;
    let artifacts: CandidateRecord["artifacts"] = [];
    let validationPolicyVersion: string | undefined;
    try {
      const rawResult = await this.options.renderer.validateAndRender({
        projectId: input.projectId,
        candidateId: input.candidateId,
        source: claimed.source,
        sourceHash: claimed.candidate.sourceHash,
        previewProfile: input.previewProfile,
        signal: input.signal,
      });
      if (input.signal?.aborted) throw new CadDomainError("CANCELLED", "Rendering was cancelled.");
      const decision = evaluateRenderResult({
        rawResult,
        sourceHash: claimed.candidate.sourceHash,
        validationPolicyVersion: this.validationPolicyVersion,
        acceptRendererProvenance: this.options.acceptRendererProvenance,
        hashBytes: sha256,
      });
      diagnostics = decision.diagnostics;
      if (decision.outcome === "VALID") {
        state = "VALID";
        renderer = decision.provenance;
        validationPolicyVersion = decision.validationPolicyVersion;
        artifacts = decision.artifacts.map((artifact) => artifact.manifest);
        assertArtifactSet(artifacts, claimed.candidate.sourceHash, decision.provenance);
      }
    } catch (error) {
      diagnostics = [{
        code: error instanceof CadDomainError ? error.code : "RENDER_FAILED",
        severity: "error",
        message: error instanceof CadDomainError ? error.message : "Renderer failed safely.",
      }];
    }

    await this.persistence.transaction((transaction) => transaction.completeCandidateValidation({
      projectId: input.projectId,
      candidateId: input.candidateId,
      state,
      diagnostics,
      renderer,
      validationPolicyVersion,
      artifacts,
      updatedAt: this.clock(),
    }));
    return (await this.persistence.readCandidate(input.projectId, input.candidateId)).candidate;
  }

  async promoteCandidate(input: {
    projectId: string;
    candidateId: string;
    expectedParentRevision: string | null;
    signal?: AbortSignal;
  }): Promise<RevisionManifest> {
    if (input.signal?.aborted) throw new CadDomainError("CANCELLED", "Operation cancelled.");
    let staleCurrentRevision: string | null | undefined;
    const manifest = await this.persistence.transaction(async (transaction) => {
      const project = await transaction.requireProject(input.projectId, true);
      const persistedCandidate = await transaction.readCandidate(input.projectId, input.candidateId, true);
      const candidate = persistedCandidate.candidate;
      if (candidate.state !== "VALID") throw new CadDomainError("INVALID_CANDIDATE_STATE", "Only a validated candidate can be promoted.");
      if (project.currentRevision !== input.expectedParentRevision || candidate.parentRevision !== input.expectedParentRevision) {
        await transaction.supersedeCandidate(input.candidateId, this.clock());
        staleCurrentRevision = project.currentRevision;
        return undefined;
      }
      this.assertApprovedProvenance(candidate);
      assertArtifactSet(candidate.artifacts, candidate.sourceHash, candidate.renderer!);
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
        createdAt,
      });
      const revisionArtifacts = candidate.artifacts.map((artifact) => artifactManifestSchema.parse({ ...artifact, sourceRevision: revisionId }));
      await transaction.insertRevisionArtifacts(revisionId, revisionArtifacts);
      await transaction.advanceCurrentRevision(input.projectId, revisionId, createdAt);
      await transaction.markCandidatePromoted(input.candidateId, createdAt);
      return (await transaction.readRevision(input.projectId, revisionId)).manifest;
    });
    if (!manifest) {
      throw new CadDomainError("STALE_REVISION", "The current revision changed before promotion.", { current: staleCurrentRevision ?? null });
    }
    return manifest;
  }

  async getExportMetadata(projectId: string, revision: string, format: "3mf"): Promise<{ revision: string; source: string; sourceHash: string; format: "3mf" }> {
    const project = await this.persistence.requireProject(projectId);
    if (!project.currentRevision) throw new CadDomainError("PROJECT_NOT_FOUND", "Project has no current revision.");
    if (project.currentRevision !== revision) {
      throw new CadDomainError("STALE_REVISION", "Exports are available only for the current revision.", { current: project.currentRevision });
    }
    return { ...await this.readModelSource(projectId, revision), format };
  }

  async restoreRevision(input: {
    projectId: string;
    revision: string;
    requestId: string;
    toolCallId: string;
    signal?: AbortSignal;
  }): Promise<RevisionManifest> {
    if (input.signal?.aborted) throw new CadDomainError("CANCELLED", "Operation cancelled.");
    return this.persistence.transaction(async (transaction) => {
      const project = await transaction.requireProject(input.projectId, true);
      if (!project.currentRevision) throw new CadDomainError("PROJECT_NOT_FOUND", "Project has no revision to restore from.");
      const target = await transaction.readRevision(input.projectId, input.revision, true);
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
        createdAt,
      });
      const restoredArtifacts = target.manifest.artifacts.map((artifact) => artifactManifestSchema.parse({ ...artifact, sourceRevision: revisionId }));
      await transaction.restoreRevisionArtifacts(revisionId, input.revision, restoredArtifacts);
      await transaction.advanceCurrentRevision(input.projectId, revisionId, createdAt);
      return (await transaction.readRevision(input.projectId, revisionId)).manifest;
    });
  }

  private assertApprovedProvenance(record: Pick<CandidateRecord | RevisionManifest, "validationPolicyVersion" | "renderer">): void {
    if (
      !record.renderer
      || record.validationPolicyVersion !== this.validationPolicyVersion
      || record.renderer.validationPolicyVersion !== this.validationPolicyVersion
      || !this.options.acceptRendererProvenance(record.renderer)
    ) {
      throw new CadDomainError("PROVENANCE_MISMATCH", "Renderer provenance is missing or mismatched.");
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
