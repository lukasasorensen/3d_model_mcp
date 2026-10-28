import {
  CONTRACT_VERSION,
  artifactManifestSchema,
  revisionManifestSchema,
  type ArtifactManifest,
  type CandidateRecord,
  type Diagnostic,
  type RendererProvenance,
  type RevisionManifest,
} from "@theoryfoundry/contracts";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import type {
  ModelProjectRepositoryOptions,
  PromotionDurabilityStep,
} from "../../domains/project/index.js";
import { CadDomainError } from "../../shared/utils/cadDomainError.util.js";
import { sha256 } from "../../shared/utils/hash.util.js";
import { VALIDATION_POLICY_VERSION } from "../../shared/validation.constants.js";
import type { DurableFiles } from "../filesystem.port.js";
import { FileProjectPaths, safeJson } from "../utils/fileLayout.util.js";
export class FileProjectPublication {
  private readonly paths: FileProjectPaths;
  private readonly clock: () => Date;
  private readonly validationPolicyVersion: string;
  constructor(
    private readonly options: ModelProjectRepositoryOptions,
    private readonly files: DurableFiles,
  ) {
    this.paths = new FileProjectPaths(options);
    this.clock = options.clock ?? (() => new Date());
    this.validationPolicyVersion =
      options.validationPolicyVersion ?? VALIDATION_POLICY_VERSION;
  }
  async publishRevision(input: {
    projectId: string;
    revisionId: string;
    parentRevision: string | null;
    restoredFrom?: string;
    candidateId: string;
    source: Uint8Array;
    sourceHash: string;
    requestId: string;
    toolCallId: string;
    diagnostics: Diagnostic[];
    geometry?: import("@theoryfoundry/contracts").GeometrySummary;
    renderer: RendererProvenance;
    artifacts: CandidateRecord["artifacts"];
  }): Promise<RevisionManifest> {
    const artifacts: ArtifactManifest[] = [];
    for (const artifact of input.artifacts) {
      const candidatePath = join(
        this.paths.candidateRoot(input.projectId, input.candidateId),
        "artifacts",
        artifact.format === "stl" ? "preview.stl" : "export.3mf",
      );
      const bytes = await readFile(candidatePath);
      if (
        sha256(bytes) !== artifact.hash ||
        bytes.byteLength !== artifact.byteSize ||
        artifact.sourceHash !== input.sourceHash
      ) {
        throw new CadDomainError(
          "ARTIFACT_HASH_MISMATCH",
          "Candidate artifact failed integrity validation.",
        );
      }
      const immutableDirectory = join(
        this.paths.controlRoot(input.projectId),
        "artifacts",
        artifact.hash,
      );
      await mkdir(immutableDirectory, { recursive: true });
      const immutablePath = join(
        immutableDirectory,
        artifact.format === "stl" ? "preview.stl" : "export.3mf",
      );
      if (await this.files.exists(immutablePath)) {
        const immutableBytes = await readFile(immutablePath);
        if (
          immutableBytes.byteLength !== artifact.byteSize ||
          sha256(immutableBytes) !== artifact.hash
        ) {
          throw new CadDomainError(
            "ARTIFACT_HASH_MISMATCH",
            "Stored immutable artifact failed integrity validation.",
          );
        }
      } else {
        await this.files.writeDurable(immutablePath, bytes);
      }
      await this.options.failpoint?.("immutable-artifact-file-durable");
      await this.files.fsyncDirectory(immutableDirectory);
      await this.options.failpoint?.("immutable-artifact-directory-durable");
      await this.files.fsyncDirectory(dirname(immutableDirectory));
      await this.options.failpoint?.("immutable-artifacts-parent-durable");
      artifacts.push(
        artifactManifestSchema.parse({
          ...artifact,
          sourceRevision: input.revisionId,
        }),
      );
    }
    await this.options.failpoint?.("immutable-artifacts-durable");
    const manifest = revisionManifestSchema.parse({
      version: CONTRACT_VERSION,
      projectId: input.projectId,
      revisionId: input.revisionId,
      parentRevision: input.parentRevision,
      ...(input.restoredFrom ? { restoredFrom: input.restoredFrom } : {}),
      sourceHash: input.sourceHash,
      sourceBytes: input.source.byteLength,
      createdAt: this.clock().toISOString(),
      requestId: input.requestId,
      toolCallId: input.toolCallId,
      candidateId: input.candidateId,
      validationPolicyVersion: this.validationPolicyVersion,
      validationResult: "VALID",
      diagnostics: input.diagnostics,
      artifacts,
      renderer: input.renderer,
      geometry: input.geometry,
    });
    const versions = join(this.paths.controlRoot(input.projectId), "versions");
    const temporary = join(
      versions,
      `.${input.revisionId}.${randomUUID()}.tmp`,
    );
    await mkdir(temporary);
    await this.files.writeDurable(join(temporary, "model.scad"), input.source);
    await this.options.failpoint?.("revision-source-durable");
    await this.files.writeDurable(
      join(temporary, "manifest.json"),
      safeJson(manifest),
    );
    await this.options.failpoint?.("revision-manifest-file-durable");
    await this.files.fsyncDirectory(temporary);
    await this.options.failpoint?.("revision-directory-durable");
    await this.options.failpoint?.("revision-manifest-durable");
    await rename(
      temporary,
      this.paths.versionRoot(input.projectId, input.revisionId),
    );
    await this.options.failpoint?.("revision-renamed");
    await this.files.fsyncDirectory(versions);
    await this.options.failpoint?.("versions-directory-durable");
    await this.options.failpoint?.("revision-published");
    await this.writeAtomicPromotionPointer(
      join(this.paths.controlRoot(input.projectId), "CURRENT"),
      `${input.revisionId}\n`,
      ["current-temp-durable", "current-renamed", "current-directory-durable"],
    );
    await this.options.failpoint?.("current-advanced");
    await this.writeAtomicPromotionPointer(
      join(this.paths.projectRoot(input.projectId), "model.scad"),
      input.source,
      ["model-temp-durable", "model-renamed", "model-directory-durable"],
    );
    await this.options.failpoint?.("model-materialized");
    return manifest;
  }
  async writeAtomicPromotionPointer(
    path: string,
    contents: string | Uint8Array,
    steps: readonly [
      PromotionDurabilityStep,
      PromotionDurabilityStep,
      PromotionDurabilityStep,
    ],
  ): Promise<void> {
    const temporary = join(
      dirname(path),
      `.${basename(path)}.${randomUUID()}.tmp`,
    );
    await this.files.writeDurable(temporary, contents);
    await this.options.failpoint?.(steps[0]);
    await rename(temporary, path);
    await this.options.failpoint?.(steps[1]);
    await this.files.fsyncDirectory(dirname(path));
    await this.options.failpoint?.(steps[2]);
  }
}
