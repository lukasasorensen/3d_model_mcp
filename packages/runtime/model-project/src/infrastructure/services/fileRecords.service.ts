import {
  candidateRecordSchema,
  projectSummarySchema,
  revisionManifestSchema,
  type CandidateRecord,
  type RevisionManifest,
} from "@theoryfoundry/contracts";
import { mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import type {
  ModelProjectRepositoryOptions,
  ProjectSummary,
} from "../../domains/project/index.js";
import { CadDomainError } from "../../shared/utils/cadDomainError.util.js";
import { sha256 } from "../../shared/utils/hash.util.js";
import { assertArtifactSet } from "../../shared/utils/renderPolicy.util.js";
import type { DurableFiles, FileLocks } from "../filesystem.port.js";
import { FileProjectPaths, safeJson } from "../utils/fileLayout.util.js";
export class FileProjectRecords {
  private readonly paths: FileProjectPaths;
  private readonly clock: () => Date;
  constructor(
    options: ModelProjectRepositoryOptions,
    private readonly files: DurableFiles,
    private readonly locks: FileLocks,
  ) {
    this.paths = new FileProjectPaths(options);
    this.clock = options.clock ?? (() => new Date());
  }
  async ensureProject(projectId: string): Promise<void> {
    const control = this.paths.controlRoot(projectId);
    await mkdir(join(control, "versions"), { recursive: true });
    await mkdir(join(control, "candidates"), { recursive: true });
    await mkdir(join(control, "artifacts"), { recursive: true });
    await mkdir(join(control, "locks"), { recursive: true });
  }
  async readProjectDetails(projectId: string): Promise<ProjectSummary> {
    try {
      return projectSummarySchema.parse(
        JSON.parse(
          await readFile(
            join(this.paths.controlRoot(projectId), "project.json"),
            "utf8",
          ),
        ),
      );
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT")
        return projectSummarySchema.parse({ projectId });
      throw error;
    }
  }
  async readCurrent(projectId: string): Promise<string | null> {
    const pointer = join(this.paths.controlRoot(projectId), "CURRENT");
    try {
      const revisionId = (await readFile(pointer, "utf8")).trim();
      revisionManifestSchema.shape.revisionId.parse(revisionId);
      const manifest = await this.readManifest(projectId, revisionId);
      await this.reconcilePromotedCandidate(manifest);
      return revisionId;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      if (error instanceof CadDomainError) {
        throw new CadDomainError(
          "CORRUPT_PROJECT",
          "The authoritative current revision is corrupt or incomplete.",
        );
      }
      throw new CadDomainError(
        "CORRUPT_PROJECT",
        "The authoritative current revision is corrupt or incomplete.",
      );
    }
  }
  async readManifest(
    projectId: string,
    revisionId: string,
  ): Promise<RevisionManifest> {
    try {
      const value: unknown = JSON.parse(
        await readFile(
          join(this.paths.versionRoot(projectId, revisionId), "manifest.json"),
          "utf8",
        ),
      );
      const manifest = revisionManifestSchema.parse(value);
      if (
        manifest.projectId !== projectId ||
        manifest.revisionId !== revisionId
      )
        throw new Error("binding mismatch");
      const source = await readFile(
        join(this.paths.versionRoot(projectId, revisionId), "model.scad"),
      );
      if (
        sha256(source) !== manifest.sourceHash ||
        source.byteLength !== manifest.sourceBytes
      )
        throw new Error("source mismatch");
      assertArtifactSet(
        manifest.artifacts,
        manifest.sourceHash,
        manifest.renderer,
        revisionId,
      );
      for (const artifact of manifest.artifacts) {
        const artifactPath = join(
          this.paths.controlRoot(projectId),
          "artifacts",
          artifact.hash,
          artifact.format === "stl" ? "preview.stl" : "export.3mf",
        );
        const bytes = await readFile(artifactPath);
        if (
          sha256(bytes) !== artifact.hash ||
          bytes.byteLength !== artifact.byteSize
        )
          throw new Error("artifact mismatch");
      }
      return manifest;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        throw new CadDomainError("REVISION_NOT_FOUND", "Revision not found.", {
          revisionId,
        });
      }
      if (error instanceof CadDomainError) throw error;
      throw new CadDomainError(
        "CORRUPT_PROJECT",
        "Revision data failed integrity validation.",
        { revisionId },
      );
    }
  }
  async readCandidate(
    projectId: string,
    candidateId: string,
  ): Promise<CandidateRecord> {
    try {
      const value: unknown = JSON.parse(
        await readFile(
          join(
            this.paths.candidateRoot(projectId, candidateId),
            "candidate.json",
          ),
          "utf8",
        ),
      );
      const candidate = candidateRecordSchema.parse(value);
      if (
        candidate.projectId !== projectId ||
        candidate.candidateId !== candidateId
      )
        throw new Error("binding mismatch");
      return candidate;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        throw new CadDomainError(
          "CANDIDATE_NOT_FOUND",
          "Candidate not found.",
          { candidateId },
        );
      }
      if (error instanceof CadDomainError) throw error;
      throw new CadDomainError(
        "CORRUPT_PROJECT",
        "Candidate data failed integrity validation.",
        { candidateId },
      );
    }
  }
  async reconcilePromotedCandidate(manifest: RevisionManifest): Promise<void> {
    await this.locks.withProjectLock(
      manifest.projectId,
      `candidate-${manifest.candidateId}`,
      async () => {
        let candidate: CandidateRecord;
        try {
          candidate = await this.readCandidate(
            manifest.projectId,
            manifest.candidateId,
          );
        } catch (error) {
          if (
            error instanceof CadDomainError &&
            error.code === "CANDIDATE_NOT_FOUND" &&
            manifest.candidateId.startsWith("restore-")
          )
            return;
          throw error;
        }
        if (candidate.sourceHash !== manifest.sourceHash) {
          throw new CadDomainError(
            "CORRUPT_PROJECT",
            "Current revision and originating candidate disagree.",
          );
        }
        if (candidate.state === "VALID") {
          await this.updateCandidate(candidate, "PROMOTED");
          return;
        }
        if (candidate.state !== "PROMOTED") {
          throw new CadDomainError(
            "CORRUPT_PROJECT",
            "Current revision references a candidate in an inconsistent state.",
          );
        }
      },
    );
  }
  async updateCandidate(
    candidate: CandidateRecord,
    nextState: CandidateRecord["state"],
    patch: Partial<CandidateRecord> = {},
  ): Promise<CandidateRecord> {
    const allowed: Partial<
      Record<CandidateRecord["state"], CandidateRecord["state"][]>
    > = {
      CREATED: ["RUNNING"],
      RUNNING: ["VALID", "REJECTED", "CREATED"],
      VALID: ["PROMOTED", "SUPERSEDED"],
    };
    if (!allowed[candidate.state]?.includes(nextState)) {
      throw new CadDomainError(
        "INVALID_CANDIDATE_STATE",
        `Candidate cannot transition from ${candidate.state} to ${nextState}.`,
      );
    }
    const updated = candidateRecordSchema.parse({
      ...candidate,
      ...patch,
      state: nextState,
      updatedAt: this.clock().toISOString(),
    });
    await this.files.writeAtomic(
      join(
        this.paths.candidateRoot(candidate.projectId, candidate.candidateId),
        "candidate.json",
      ),
      safeJson(updated),
    );
    return updated;
  }
}
