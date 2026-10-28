import {
  projectIdSchema,
  type ArtifactManifest,
  type RevisionManifest,
} from "@theoryfoundry/contracts";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import type {
  ModelProjectRepositoryOptions,
  ProjectState,
  ProjectSummary,
} from "../../domains/project/index.js";
import { CadDomainError } from "../../shared/utils/cadDomainError.util.js";
import { sha256 } from "../../shared/utils/hash.util.js";
import type { DurableFiles, FileRecords } from "../filesystem.port.js";
import { FileProjectPaths } from "../utils/fileLayout.util.js";
export class FileProjectQueries {
  private readonly paths: FileProjectPaths;
  constructor(
    private readonly options: ModelProjectRepositoryOptions,
    private readonly files: DurableFiles,
    private readonly records: FileRecords,
  ) {
    this.paths = new FileProjectPaths(options);
  }
  async getProjectState(projectId: string): Promise<ProjectState> {
    const root = this.paths.projectRoot(projectId);
    if (!(await this.files.exists(root)))
      return {
        projectId,
        currentRevision: null,
        source: null,
        artifacts: [],
        diagnostics: [],
      };
    const currentRevision = await this.records.readCurrent(projectId);
    if (!currentRevision)
      return {
        projectId,
        currentRevision: null,
        source: null,
        artifacts: [],
        diagnostics: [],
      };
    const manifest = await this.records.readManifest(
      projectId,
      currentRevision,
    );
    const authoritativeSource = await readFile(
      join(this.paths.versionRoot(projectId, currentRevision), "model.scad"),
    );
    const materialized = join(root, "model.scad");
    if (
      !(await this.files.exists(materialized)) ||
      sha256(await readFile(materialized)) !== manifest.sourceHash
    )
      await this.files.writeAtomic(materialized, authoritativeSource);
    return {
      projectId,
      currentRevision,
      source: { hash: manifest.sourceHash, byteSize: manifest.sourceBytes },
      artifacts: manifest.artifacts,
      diagnostics: manifest.diagnostics,
    };
  }
  async listProjects(): Promise<ProjectSummary[]> {
    let entries;
    try {
      entries = await readdir(this.options.workspaceRoot, {
        withFileTypes: true,
      });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw error;
    }
    return Promise.all(
      entries
        .filter(
          (entry) =>
            entry.isDirectory() &&
            projectIdSchema.safeParse(entry.name).success,
        )
        .sort((left, right) => left.name.localeCompare(right.name))
        .map((entry) => this.records.readProjectDetails(entry.name)),
    );
  }
  async readValidatedCandidateSource(projectId: string, candidateId: string) {
    const candidate = await this.records.readCandidate(projectId, candidateId);
    if (candidate.state !== "VALID")
      throw new CadDomainError(
        "INVALID_CANDIDATE_STATE",
        "Validate the candidate before requesting a preview.",
      );
    const source = await readFile(
      join(this.paths.candidateRoot(projectId, candidateId), "model.scad"),
      "utf8",
    );
    if (sha256(source) !== candidate.sourceHash)
      throw new CadDomainError(
        "SOURCE_HASH_MISMATCH",
        "Candidate source failed integrity validation.",
      );
    return { candidateId, source, sourceHash: candidate.sourceHash };
  }
  async readModelSource(
    projectId: string,
    revision?: string,
  ): Promise<{ revision: string; source: string; sourceHash: string }> {
    const selected = revision ?? (await this.records.readCurrent(projectId));
    if (!selected)
      throw new CadDomainError(
        "PROJECT_NOT_FOUND",
        "Project has no current revision.",
      );
    const manifest = await this.records.readManifest(projectId, selected);
    return {
      revision: selected,
      source: await readFile(
        join(this.paths.versionRoot(projectId, selected), "model.scad"),
        "utf8",
      ),
      sourceHash: manifest.sourceHash,
    };
  }
  async listRevisions(projectId: string): Promise<RevisionManifest[]> {
    const current = await this.records.readCurrent(projectId);
    if (!current) return [];
    const revisions: RevisionManifest[] = [];
    let cursor: string | null = current;
    const seen = new Set<string>();
    while (cursor) {
      if (seen.has(cursor))
        throw new CadDomainError(
          "CORRUPT_PROJECT",
          "Revision history contains a cycle.",
        );
      seen.add(cursor);
      const manifest = await this.records.readManifest(projectId, cursor);
      revisions.push(manifest);
      cursor = manifest.parentRevision;
    }
    return revisions;
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
    const current = await this.records.readCurrent(projectId);
    if (!current)
      throw new CadDomainError(
        "PROJECT_NOT_FOUND",
        "Project has no current revision.",
      );
    if (revision !== current)
      throw new CadDomainError(
        "STALE_REVISION",
        "Exports are available only for the current revision.",
        { current },
      );
    const manifest = await this.records.readManifest(projectId, revision);
    const source = await readFile(
      join(this.paths.versionRoot(projectId, revision), "model.scad"),
      "utf8",
    );
    if (sha256(source) !== manifest.sourceHash)
      throw new CadDomainError(
        "SOURCE_HASH_MISMATCH",
        "Revision source failed integrity validation.",
      );
    return { revision, source, sourceHash: manifest.sourceHash, format };
  }
  async readArtifact(
    projectId: string,
    revision: string,
    artifactId: string,
  ): Promise<{ manifest: ArtifactManifest; bytes: Uint8Array }> {
    const revisionManifest = await this.records.readManifest(
      projectId,
      revision,
    );
    const manifest = revisionManifest.artifacts.find(
      (item) => item.artifactId === artifactId,
    );
    if (!manifest)
      throw new CadDomainError(
        "ARTIFACT_NOT_FOUND",
        "Requested artifact is not available for this revision.",
      );
    if (manifest.format === "3mf") {
      const current = await this.records.readCurrent(projectId);
      if (revision !== current)
        throw new CadDomainError(
          "STALE_REVISION",
          "3MF downloads are available only for the current revision.",
          { current },
        );
    }
    const filename = manifest.format === "stl" ? "preview.stl" : "export.3mf";
    const bytes = await readFile(
      join(
        this.paths.controlRoot(projectId),
        "artifacts",
        manifest.hash,
        filename,
      ),
    );
    if (
      bytes.byteLength !== manifest.byteSize ||
      sha256(bytes) !== manifest.hash
    ) {
      throw new CadDomainError(
        "ARTIFACT_HASH_MISMATCH",
        "Stored artifact failed integrity validation.",
      );
    }
    return { manifest, bytes };
  }
}
