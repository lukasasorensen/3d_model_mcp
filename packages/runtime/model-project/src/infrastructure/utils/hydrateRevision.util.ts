import {
  CONTRACT_VERSION,
  parameterSnapshotFields,
  revisionManifestSchema,
} from "@theoryfoundry/contracts";
import type { PersistedRevision } from "../../domains/project/index.js";
import type { RevisionRow } from "../postgresPersistence.types.js";
import { asIsoTimestamp } from "../../shared/utils/timestamp.util.js";
import { checkedParameterSnapshot } from "../../shared/utils/parameterSnapshot.util.js";
import { CadDomainError } from "../../shared/utils/cadDomainError.util.js";
import { sha256 } from "../../shared/utils/hash.util.js";
import { assertArtifactSet } from "../../shared/utils/renderPolicy.util.js";

export function hydrateRevision(
  row: RevisionRow,
  artifacts: unknown[],
): PersistedRevision {
  const manifest = revisionManifestSchema.parse({
    version: CONTRACT_VERSION,
    projectId: row.project_id,
    revisionId: row.id,
    parentRevision: row.parent_revision_id,
    ...(row.restored_from_revision_id
      ? { restoredFrom: row.restored_from_revision_id }
      : {}),
    ...parameterSnapshotFields(
      checkedParameterSnapshot(row.source, row.parameter_snapshot),
    ),
    sourceHash: row.source_hash,
    sourceBytes: row.source_bytes,
    createdAt: asIsoTimestamp(row.created_at),
    requestId: row.request_id,
    toolCallId: row.tool_call_id,
    candidateId: row.candidate_id,
    validationPolicyVersion: row.validation_policy_version,
    validationResult: "VALID",
    diagnostics: row.diagnostics,
    artifacts,
    renderer: row.renderer,
    ...(row.geometry ? { geometry: row.geometry } : {}),
  });
  if (
    sha256(row.source) !== manifest.sourceHash ||
    Buffer.byteLength(row.source) !== manifest.sourceBytes
  ) {
    throw new CadDomainError(
      "CORRUPT_PROJECT",
      "Revision source failed integrity validation.",
      { revisionId: row.id },
    );
  }
  assertArtifactSet(
    manifest.artifacts,
    manifest.sourceHash,
    manifest.renderer,
    manifest.revisionId,
  );
  return { manifest, source: row.source };
}
