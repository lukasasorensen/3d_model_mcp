import {
  CONTRACT_VERSION,
  candidateRecordSchema,
  createProjectInputSchema,
  isBrowserRendererProvenance,
  isProductionRendererProvenance,
  projectSummarySchema,
  updateProjectInputSchema,
  type CandidateRecord,
  type CreateProjectInput,
  type RevisionManifest,
  type UpdateProjectInput,
} from "@theoryfoundry/contracts";
import { randomUUID } from "node:crypto";
import { copyFile, mkdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type {
  ModelProjectRepositoryOptions,
  ProjectSummary,
} from "../../domains/project/index.js";
import { CadDomainError } from "../../shared/utils/cadDomainError.util.js";
import { sha256 } from "../../shared/utils/hash.util.js";
import { assertArtifactSet } from "../../shared/utils/renderPolicy.util.js";
import { assertSourcePolicy } from "../../shared/utils/sourcePolicy.util.js";
import { VALIDATION_POLICY_VERSION } from "../../shared/validation.constants.js";
import type {
  DurableFiles,
  FileLocks,
  FileRecords,
} from "../filesystem.port.js";
import type { FileProjectPublication } from "../services/filePublication.service.js";
import type { FileProjectQueries } from "../services/fileQueries.service.js";
import type { FileCandidateValidation } from "../services/fileValidation.service.js";
import { FileProjectPaths, safeJson } from "../utils/fileLayout.util.js";
export class FileProjectWorkflow {
  private readonly paths: FileProjectPaths;
  private readonly clock: () => Date;
  private readonly createId: () => string;
  private readonly validationPolicyVersion: string;
  constructor(
    private readonly options: ModelProjectRepositoryOptions,
    private readonly files: DurableFiles,
    private readonly locks: FileLocks,
    private readonly records: FileRecords,
    private readonly publication: FileProjectPublication,
    private readonly validation: FileCandidateValidation,
    private readonly queries: FileProjectQueries,
  ) {
    this.paths = new FileProjectPaths(options);
    this.clock = options.clock ?? (() => new Date());
    this.createId = options.createId ?? randomUUID;
    this.validationPolicyVersion =
      options.validationPolicyVersion ?? VALIDATION_POLICY_VERSION;
  }
  async createProject(input: CreateProjectInput): Promise<ProjectSummary> {
    const details = createProjectInputSchema.parse(input);
    const projectId = this.createId();
    await this.records.ensureProject(projectId);
    const project = { projectId, ...details };
    await this.files.writeAtomic(
      join(this.paths.controlRoot(projectId), "project.json"),
      JSON.stringify(project),
    );
    return project;
  }
  async updateProject(raw: UpdateProjectInput): Promise<ProjectSummary> {
    const { projectId, ...details } = updateProjectInputSchema.parse(raw);
    if (!(await this.files.exists(this.paths.projectRoot(projectId))))
      throw new CadDomainError("PROJECT_NOT_FOUND", "Project not found.");
    return this.locks.withProjectLock(projectId, "details", async () => {
      const project = projectSummarySchema.parse({
        ...(await this.records.readProjectDetails(projectId)),
        ...details,
      });
      await this.files.writeAtomic(
        join(this.paths.controlRoot(projectId), "project.json"),
        JSON.stringify(project),
      );
      return project;
    });
  }
  async getCandidate(projectId: string, candidateId: string) {
    await this.records.ensureProject(projectId);
    return this.records.readCandidate(projectId, candidateId);
  }
  async proposeModelSource(input: {
    projectId: string;
    parentRevision: string | null;
    source: string;
    requestId: string;
    toolCallId: string;
  }): Promise<CandidateRecord> {
    assertSourcePolicy(input.source);
    await this.records.ensureProject(input.projectId);
    const current = await this.records.readCurrent(input.projectId);
    if (input.parentRevision !== current) {
      throw new CadDomainError(
        "STALE_REVISION",
        "Candidate parent is not the current revision.",
        {
          expected: current,
          received: input.parentRevision,
        },
      );
    }
    if (input.parentRevision)
      await this.records.readManifest(input.projectId, input.parentRevision);
    const candidateId = this.createId();
    const root = this.paths.candidateRoot(input.projectId, candidateId);
    await mkdir(root, { recursive: false });
    const sourceBytes = Buffer.byteLength(input.source);
    const now = this.clock().toISOString();
    const candidate = candidateRecordSchema.parse({
      version: CONTRACT_VERSION,
      projectId: input.projectId,
      candidateId,
      parentRevision: input.parentRevision,
      sourceHash: sha256(input.source),
      sourceBytes,
      state: "CREATED",
      createdAt: now,
      updatedAt: now,
      requestId: input.requestId,
      toolCallId: input.toolCallId,
      diagnostics: [],
      artifacts: [],
    });
    await this.files.writeDurable(join(root, "model.scad"), input.source);
    await this.files.writeDurable(
      join(root, "candidate.json"),
      safeJson(candidate),
    );
    await this.files.fsyncDirectory(root);
    await this.files.fsyncDirectory(dirname(root));
    return candidate;
  }
  async promoteCandidate(input: {
    projectId: string;
    candidateId: string;
    expectedParentRevision: string | null;
    signal?: AbortSignal;
  }): Promise<RevisionManifest> {
    return this.locks.withProjectLock(
      input.projectId,
      "promotion",
      async () => {
        const candidate = await this.records.readCandidate(
          input.projectId,
          input.candidateId,
        );
        if (candidate.state !== "VALID")
          throw new CadDomainError(
            "INVALID_CANDIDATE_STATE",
            "Only a validated candidate can be promoted.",
          );
        const current = await this.records.readCurrent(input.projectId);
        if (
          current !== input.expectedParentRevision ||
          candidate.parentRevision !== input.expectedParentRevision
        ) {
          await this.records.updateCandidate(candidate, "SUPERSEDED");
          throw new CadDomainError(
            "STALE_REVISION",
            "The current revision changed before promotion.",
            { current },
          );
        }
        const source = await readFile(
          join(
            this.paths.candidateRoot(input.projectId, input.candidateId),
            "model.scad",
          ),
        );
        if (
          sha256(source) !== candidate.sourceHash ||
          source.byteLength !== candidate.sourceBytes
        )
          throw new CadDomainError(
            "SOURCE_HASH_MISMATCH",
            "Candidate source failed integrity validation.",
          );
        if (candidate.validationPolicyVersion !== this.validationPolicyVersion)
          throw new CadDomainError(
            "POLICY_MISMATCH",
            "Candidate validation policy does not match.",
          );
        if (
          !candidate.renderer ||
          candidate.renderer.validationPolicyVersion !==
            this.validationPolicyVersion
        )
          throw new CadDomainError(
            "PROVENANCE_MISMATCH",
            "Candidate renderer provenance is missing or mismatched.",
          );
        if (
          (!isProductionRendererProvenance(candidate.renderer) &&
            !isBrowserRendererProvenance(candidate.renderer)) ||
          !this.options.acceptRendererProvenance(candidate.renderer)
        ) {
          throw new CadDomainError(
            "PROVENANCE_MISMATCH",
            "Candidate renderer provenance is not approved.",
          );
        }
        assertArtifactSet(
          candidate.artifacts,
          candidate.sourceHash,
          candidate.renderer,
        );
        const revisionId = this.createId();
        const manifest = await this.publication.publishRevision({
          projectId: input.projectId,
          revisionId,
          parentRevision: current,
          candidateId: candidate.candidateId,
          source,
          sourceHash: candidate.sourceHash,
          requestId: candidate.requestId,
          toolCallId: candidate.toolCallId,
          diagnostics: candidate.diagnostics,
          renderer: candidate.renderer,
          geometry: candidate.geometry,
          artifacts: candidate.artifacts,
        });
        await this.records.reconcilePromotedCandidate(manifest);
        return manifest;
      },
      input.signal,
    );
  }
  async restoreRevision(input: {
    projectId: string;
    revision: string;
    requestId: string;
    toolCallId: string;
    signal?: AbortSignal;
  }): Promise<RevisionManifest> {
    return this.locks.withProjectLock(
      input.projectId,
      "promotion",
      async () => {
        const current = await this.records.readCurrent(input.projectId);
        if (!current)
          throw new CadDomainError(
            "PROJECT_NOT_FOUND",
            "Project has no revision to restore from.",
          );
        const target = await this.records.readManifest(
          input.projectId,
          input.revision,
        );
        if (
          target.validationPolicyVersion !== this.validationPolicyVersion ||
          target.renderer.validationPolicyVersion !==
            this.validationPolicyVersion
        ) {
          throw new CadDomainError(
            "POLICY_MISMATCH",
            "Historical revision does not match the active validation policy.",
          );
        }
        if (
          (!isProductionRendererProvenance(target.renderer) &&
            !isBrowserRendererProvenance(target.renderer)) ||
          !this.options.acceptRendererProvenance(target.renderer)
        ) {
          throw new CadDomainError(
            "PROVENANCE_MISMATCH",
            "Historical renderer provenance is not approved.",
          );
        }
        const source = await readFile(
          join(
            this.paths.versionRoot(input.projectId, input.revision),
            "model.scad",
          ),
        );
        const candidateId = `restore-${this.createId()}`;
        const candidateRoot = this.paths.candidateRoot(
          input.projectId,
          candidateId,
        );
        await mkdir(join(candidateRoot, "artifacts"), { recursive: true });
        await this.files.writeDurable(
          join(candidateRoot, "model.scad"),
          source,
        );
        for (const artifact of target.artifacts) {
          const sourcePath = join(
            this.paths.controlRoot(input.projectId),
            "artifacts",
            artifact.hash,
            artifact.format === "stl" ? "preview.stl" : "export.3mf",
          );
          await copyFile(
            sourcePath,
            join(
              candidateRoot,
              "artifacts",
              artifact.format === "stl" ? "preview.stl" : "export.3mf",
            ),
          );
        }
        const revisionId = this.createId();
        return this.publication.publishRevision({
          projectId: input.projectId,
          revisionId,
          parentRevision: current,
          restoredFrom: input.revision,
          candidateId,
          source,
          sourceHash: target.sourceHash,
          requestId: input.requestId,
          toolCallId: input.toolCallId,
          diagnostics: target.diagnostics,
          renderer: target.renderer,
          geometry: target.geometry,
          artifacts: target.artifacts.map(({ sourceRevision, ...artifact }) => {
            void sourceRevision;
            return artifact;
          }),
        });
      },
      input.signal,
    );
  }
  getProjectState: FileProjectQueries["getProjectState"] = (...args) =>
    this.queries.getProjectState(...args);
  listProjects: FileProjectQueries["listProjects"] = (...args) =>
    this.queries.listProjects(...args);
  readValidatedCandidateSource: FileProjectQueries["readValidatedCandidateSource"] =
    (...args) => this.queries.readValidatedCandidateSource(...args);
  readModelSource: FileProjectQueries["readModelSource"] = (...args) =>
    this.queries.readModelSource(...args);
  listRevisions: FileProjectQueries["listRevisions"] = (...args) =>
    this.queries.listRevisions(...args);
  getExportMetadata: FileProjectQueries["getExportMetadata"] = (...args) =>
    this.queries.getExportMetadata(...args);
  readArtifact: FileProjectQueries["readArtifact"] = (...args) =>
    this.queries.readArtifact(...args);
  validateAndRender: FileCandidateValidation["validateAndRender"] = (...args) =>
    this.validation.validateAndRender(...args);
}
