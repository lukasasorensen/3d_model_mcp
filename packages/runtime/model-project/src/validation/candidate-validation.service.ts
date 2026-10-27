import { randomUUID } from "node:crypto";
import type {
  CandidateRecord,
  Diagnostic,
  RendererProvenance,
} from "@theoryfoundry/contracts";
import type { PostgresProjectPersistence } from "../postgres-project-persistence.js";
import { CadDomainError } from "../shared/utils/cadDomainError.util.js";
import {
  assertArtifactSet,
  evaluateRenderResult,
} from "../shared/utils/renderPolicy.util.js";
import { sha256 } from "../shared/utils/hash.util.js";

/** Shared candidate state transitions; callers supply one transaction per operation. */
export class CandidateValidationService {
  constructor(
    private readonly options: {
      validationPolicyVersion: string;
      acceptRendererProvenance: (value: RendererProvenance) => boolean;
      clock: () => Date;
    },
  ) {}

  async begin(
    transaction: PostgresProjectPersistence,
    input: { projectId: string; candidateId: string },
  ) {
    const persisted = await transaction.readCandidate(
      input.projectId,
      input.candidateId,
      true,
    );
    if (persisted.candidate.state === "VALID")
      return { ...persisted, attemptId: undefined };
    if (persisted.candidate.state === "RUNNING")
      throw new CadDomainError(
        "VALIDATION_RUNNING",
        "Candidate validation is already running.",
        {
          attemptId: persisted.candidate.activeAttemptId ?? "legacy",
          retryable: true,
        },
      );
    if (persisted.candidate.state !== "CREATED")
      throw new CadDomainError(
        "INVALID_CANDIDATE_STATE",
        "Only a created candidate can be rendered.",
      );
    const attemptId = `attempt-${randomUUID()}`;
    await transaction.markCandidateRunning(
      input.projectId,
      input.candidateId,
      attemptId,
      this.options.clock(),
    );
    return { ...persisted, attemptId };
  }

  async complete(
    transaction: PostgresProjectPersistence,
    input: {
      projectId: string;
      candidateId: string;
      attemptId: string;
      sourceHash: string;
      rawResult?: unknown;
      error?: CadDomainError;
    },
  ) {
    const persisted = await transaction.readCandidate(
      input.projectId,
      input.candidateId,
      true,
    );
    if (
      persisted.candidate.state !== "RUNNING" ||
      persisted.candidate.activeAttemptId !== input.attemptId
    ) {
      return { candidate: persisted.candidate, error: input.error };
    }
    if (persisted.candidate.sourceHash !== input.sourceHash)
      throw new CadDomainError(
        "SOURCE_HASH_MISMATCH",
        "Validation source changed.",
      );
    let state: "VALID" | "REJECTED" | "CREATED" = "REJECTED";
    let diagnostics: Diagnostic[] = [];
    let renderer: RendererProvenance | undefined;
    let geometry:
      import("@theoryfoundry/contracts").GeometrySummary | undefined;
    let artifacts: CandidateRecord["artifacts"] = [];
    let validationPolicyVersion: string | undefined;
    let operationalError = input.error;
    try {
      if (operationalError) {
        state = "CREATED";
        diagnostics = [
          {
            code: operationalError.code,
            severity: "error",
            message: operationalError.message,
          },
        ];
      } else {
        const decision = evaluateRenderResult({
          rawResult: input.rawResult,
          sourceHash: input.sourceHash,
          validationPolicyVersion: this.options.validationPolicyVersion,
          acceptRendererProvenance: this.options.acceptRendererProvenance,
          hashBytes: sha256,
        });
        diagnostics = decision.diagnostics;
        if (decision.outcome === "VALID") {
          state = "VALID";
          geometry = decision.geometry;
          renderer = decision.provenance;
          validationPolicyVersion = decision.validationPolicyVersion;
          artifacts = decision.artifacts.map((artifact) => artifact.manifest);
          assertArtifactSet(artifacts, input.sourceHash, renderer);
        }
      }
    } catch (error) {
      operationalError =
        error instanceof CadDomainError
          ? new CadDomainError(error.code, error.message, {
              retryable: true,
              ...error.details,
            })
          : new CadDomainError(
              "RENDER_FAILED",
              "Validation could not complete; retry the same candidate.",
              { retryable: true },
            );
      state = "CREATED";
      diagnostics = [
        {
          code: operationalError.code,
          severity: "error",
          message: operationalError.message,
        },
      ];
    }
    await transaction.completeCandidateValidation({
      ...input,
      error: operationalError,
      state,
      diagnostics,
      renderer,
      geometry,
      validationPolicyVersion,
      artifacts,
      updatedAt: this.options.clock(),
    });
    return {
      candidate: (
        await transaction.readCandidate(input.projectId, input.candidateId)
      ).candidate,
      error: operationalError,
    };
  }
}
