import { artifactManifestSchema } from "@theoryfoundry/contracts";
import type { CadToolName } from "@theoryfoundry/mcp";
import type { EventDraft } from "../chat.types.js";
export function projectStructuredEvents(
  toolName: CadToolName,
  toolCallId: string,
  result: Record<string, unknown>,
  emit: (draft: EventDraft) => void,
): void {
  const candidate = result.candidate as
    { candidateId?: string; state?: string } | undefined;
  if (candidate?.candidateId) {
    let status:
      | "candidate_created"
      | "candidate_validated"
      | "candidate_rejected"
      | undefined;
    if (candidate.state === "CREATED") status = "candidate_created";
    else if (candidate.state === "VALID") status = "candidate_validated";
    else if (candidate.state === "REJECTED") status = "candidate_rejected";
    if (status)
      emit({
        type: "revision",
        status,
        toolCallId,
        candidateId: candidate.candidateId,
      });
  }
  const revision = result.revision as
    | { revisionId?: string; candidateId?: string; artifacts?: unknown[] }
    | undefined;
  if (revision?.revisionId) {
    emit({
      type: "revision",
      status:
        toolName === "promote_candidate" ? "candidate_promoted" : "current",
      toolCallId,
      revisionId: revision.revisionId,
      candidateId: revision.candidateId,
    });
    for (const raw of revision.artifacts ?? []) {
      const parsed = artifactManifestSchema.safeParse(raw);
      if (parsed.success)
        emit({
          type: "artifact",
          toolCallId,
          artifactId: parsed.data.artifactId,
          revisionId: parsed.data.sourceRevision,
          format: parsed.data.format,
          mimeType: parsed.data.mimeType,
          hash: parsed.data.hash,
          byteSize: parsed.data.byteSize,
        });
    }
  }
  const state = result.state as
    { currentRevision?: string | null; artifacts?: unknown[] } | undefined;
  if (state?.currentRevision) {
    emit({
      type: "revision",
      status: "current",
      toolCallId,
      revisionId: state.currentRevision,
    });
    for (const raw of state.artifacts ?? []) {
      const parsed = artifactManifestSchema.safeParse(raw);
      if (parsed.success)
        emit({
          type: "artifact",
          toolCallId,
          artifactId: parsed.data.artifactId,
          revisionId: parsed.data.sourceRevision,
          format: parsed.data.format,
          mimeType: parsed.data.mimeType,
          hash: parsed.data.hash,
          byteSize: parsed.data.byteSize,
        });
    }
  }
  const artifact = artifactManifestSchema.safeParse(result.artifact);
  if (artifact.success)
    emit({
      type: "artifact",
      toolCallId,
      artifactId: artifact.data.artifactId,
      revisionId: artifact.data.sourceRevision,
      format: artifact.data.format,
      mimeType: artifact.data.mimeType,
      hash: artifact.data.hash,
      byteSize: artifact.data.byteSize,
    });
}
