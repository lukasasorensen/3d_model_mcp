import {
  CONTRACT_VERSION,
  candidateRecordSchema,
} from "@theoryfoundry/contracts";
import type { PersistedCandidate } from "../../domains/project/index.js";
import { CadDomainError } from "../../shared/utils/cadDomainError.util.js";
import { sha256 } from "../../shared/utils/hash.util.js";
import { asIsoTimestamp } from "../../shared/utils/timestamp.util.js";
import type { CandidateRow } from "../postgresPersistence.types.js";

export function hydrateCandidate(
  row: CandidateRow,
  artifacts: unknown[],
): PersistedCandidate {
  const candidate = candidateRecordSchema.parse({
    version: CONTRACT_VERSION,
    projectId: row.project_id,
    candidateId: row.id,
    parentRevision: row.parent_revision_id,
    sourceHash: row.source_hash,
    sourceBytes: row.source_bytes,
    state: row.state,
    ...(row.active_attempt_id
      ? { activeAttemptId: row.active_attempt_id }
      : {}),
    ...(row.geometry ? { geometry: row.geometry } : {}),
    createdAt: asIsoTimestamp(row.created_at),
    updatedAt: asIsoTimestamp(row.updated_at),
    requestId: row.request_id,
    toolCallId: row.tool_call_id,
    ...(row.validation_policy_version
      ? { validationPolicyVersion: row.validation_policy_version }
      : {}),
    diagnostics: row.diagnostics,
    ...(row.renderer ? { renderer: row.renderer } : {}),
    artifacts,
  });
  if (
    sha256(row.source) !== candidate.sourceHash ||
    Buffer.byteLength(row.source) !== candidate.sourceBytes
  ) {
    throw new CadDomainError(
      "CORRUPT_PROJECT",
      "Candidate source failed integrity validation.",
    );
  }
  return { candidate, source: row.source };
}
