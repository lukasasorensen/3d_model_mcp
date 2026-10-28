import {
  candidateRecordSchema,
  type CandidateRecord,
} from "@theoryfoundry/contracts";
import { randomUUID } from "node:crypto";
import { mkdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { ModelProjectRepositoryOptions } from "../../domains/project/index.js";
import { CadDomainError } from "../../shared/utils/cadDomainError.util.js";
import { sha256 } from "../../shared/utils/hash.util.js";
import { evaluateRenderResult } from "../../shared/utils/renderPolicy.util.js";
import { VALIDATION_POLICY_VERSION } from "../../shared/validation.constants.js";
import type {
  DurableFiles,
  FileLocks,
  FileRecords,
} from "../filesystem.port.js";
import { FileProjectPaths, safeJson } from "../utils/fileLayout.util.js";
export class FileCandidateValidation {
  private readonly paths: FileProjectPaths;
  private readonly validationPolicyVersion: string;
  constructor(
    private readonly options: ModelProjectRepositoryOptions,
    private readonly files: DurableFiles,
    private readonly locks: FileLocks,
    private readonly records: FileRecords,
  ) {
    this.paths = new FileProjectPaths(options);
    this.validationPolicyVersion =
      options.validationPolicyVersion ?? VALIDATION_POLICY_VERSION;
  }
  async validateAndRender(input: {
    projectId: string;
    candidateId: string;
    previewProfile: "standard";
    signal?: AbortSignal;
  }): Promise<CandidateRecord> {
    candidateRecordSchema.shape.candidateId.parse(input.candidateId);
    const observed = await this.records.readCandidate(
      input.projectId,
      input.candidateId,
    );
    if (
      observed.state === "RUNNING" &&
      Date.now() - new Date(observed.updatedAt).getTime() < 120_000
    )
      throw new CadDomainError(
        "VALIDATION_RUNNING",
        "Candidate validation is already running.",
        { attemptId: observed.activeAttemptId ?? "legacy", retryable: true },
      );
    return this.locks.withProjectLock(
      input.projectId,
      `candidate-${input.candidateId}`,
      async () => {
        let candidate = await this.records.readCandidate(
          input.projectId,
          input.candidateId,
        );
        if (candidate.state === "VALID") return candidate;
        if (candidate.state === "RUNNING") {
          if (Date.now() - new Date(candidate.updatedAt).getTime() < 120_000)
            throw new CadDomainError(
              "VALIDATION_RUNNING",
              "Candidate validation is already running.",
              {
                attemptId: candidate.activeAttemptId ?? "legacy",
                retryable: true,
              },
            );
          candidate = await this.records.updateCandidate(candidate, "CREATED", {
            activeAttemptId: undefined,
          });
        }
        if (candidate.state !== "CREATED")
          throw new CadDomainError(
            "INVALID_CANDIDATE_STATE",
            "Only a created candidate can be rendered.",
          );
        const attemptId = `attempt-${randomUUID()}`;
        const attemptPath = join(
          this.paths.candidateRoot(input.projectId, input.candidateId),
          `${attemptId}.json`,
        );
        await this.files.writeDurable(
          attemptPath,
          safeJson({
            attemptId,
            state: "RUNNING",
            deadline: new Date(Date.now() + 120_000).toISOString(),
          }),
        );
        const running = await this.records.updateCandidate(
          candidate,
          "RUNNING",
          { activeAttemptId: attemptId },
        );
        try {
          const source = await readFile(
            join(
              this.paths.candidateRoot(input.projectId, input.candidateId),
              "model.scad",
            ),
            "utf8",
          );
          if (sha256(source) !== running.sourceHash)
            throw new CadDomainError(
              "SOURCE_HASH_MISMATCH",
              "Candidate source hash mismatch.",
            );
          let rawResult: unknown;
          try {
            rawResult = await this.options.renderer.validateAndRender({
              projectId: input.projectId,
              candidateId: input.candidateId,
              attemptId,
              source,
              sourceHash: running.sourceHash,
              previewProfile: input.previewProfile,
              signal: input.signal,
            });
          } catch (error) {
            if (error instanceof CadDomainError) throw error;
            if (input.signal?.aborted)
              throw new CadDomainError("CANCELLED", "Rendering was cancelled.");
            throw new CadDomainError(
              "RENDER_FAILED",
              "Renderer failed safely.",
            );
          }
          if (input.signal?.aborted)
            throw new CadDomainError("CANCELLED", "Rendering was cancelled.");
          const decision = evaluateRenderResult({
            rawResult,
            sourceHash: running.sourceHash,
            validationPolicyVersion: this.validationPolicyVersion,
            acceptRendererProvenance: this.options.acceptRendererProvenance,
            hashBytes: sha256,
          });
          await this.files.writeAtomic(
            attemptPath,
            safeJson({ attemptId, state: decision.outcome }),
          );
          if (decision.outcome === "REJECTED")
            return this.records.updateCandidate(running, "REJECTED", {
              activeAttemptId: undefined,
              diagnostics: decision.diagnostics,
            });
          const manifests = decision.artifacts.map(
            (artifact) => artifact.manifest,
          );
          if (decision.artifacts.length > 0) {
            const artifactsDirectory = join(
              this.paths.candidateRoot(input.projectId, input.candidateId),
              "artifacts",
            );
            await mkdir(artifactsDirectory, { recursive: false });
            for (const artifact of decision.artifacts)
              await this.files.writeDurable(
                join(artifactsDirectory, artifact.filename),
                artifact.bytes,
              );
            await this.files.fsyncDirectory(artifactsDirectory);
            await this.files.fsyncDirectory(dirname(artifactsDirectory));
          }
          return this.records.updateCandidate(running, "VALID", {
            diagnostics: decision.diagnostics,
            activeAttemptId: undefined,
            geometry: decision.geometry,
            renderer: decision.provenance,
            validationPolicyVersion: decision.validationPolicyVersion,
            artifacts: manifests,
          });
        } catch (error) {
          const latest = await this.records.readCandidate(
            input.projectId,
            input.candidateId,
          );
          if (latest.state !== "RUNNING") throw error;
          const code =
            error instanceof CadDomainError ? error.code : "RENDER_FAILED";
          const message =
            error instanceof CadDomainError
              ? error.message
              : "Validation failed safely.";
          if (
            error instanceof CadDomainError &&
            [
              "SOURCE_HASH_MISMATCH",
              "ARTIFACT_HASH_MISMATCH",
              "CORRUPT_PROJECT",
              "PROVENANCE_MISMATCH",
              "POLICY_MISMATCH",
            ].includes(error.code)
          ) {
            await this.files.writeAtomic(
              attemptPath,
              safeJson({ attemptId, state: "REJECTED", code, message }),
            );
            return this.records.updateCandidate(latest, "REJECTED", {
              activeAttemptId: undefined,
              diagnostics: [{ code, severity: "error", message }],
            });
          }
          await this.files.writeAtomic(
            attemptPath,
            safeJson({
              attemptId,
              state: "FAILED",
              code,
              message,
              details: error instanceof CadDomainError ? error.details : {},
            }),
          );
          await this.records.updateCandidate(latest, "CREATED", {
            activeAttemptId: undefined,
            diagnostics: [{ code, severity: "error", message }],
          });
          throw error instanceof CadDomainError
            ? error
            : new CadDomainError("RENDER_FAILED", message, { retryable: true });
        }
      },
      input.signal,
    );
  }
}
