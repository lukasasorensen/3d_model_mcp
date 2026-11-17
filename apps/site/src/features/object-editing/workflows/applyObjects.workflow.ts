import type { ApplyObjectEdit } from "../objectEditing.schema";
import {
  proposeModelSourceOutputSchema,
  validateAndRenderOutputSchema,
  promoteCandidateOutputSchema,
  listRevisionsOutputSchema,
  type ParameterControlsEvent,
} from "@theoryfoundry/contracts";
import type { ObjectEditingRuntime } from "../objectEditing.port";
import { ObjectFailure, toolFailure } from "../utils/objectFailure.util";

type EventDraft = ParameterControlsEvent extends infer E
  ? E extends ParameterControlsEvent
    ? Omit<E, "requestId" | "sessionId" | "sequence">
    : never
  : never;

export async function applyObjects(
  projectId: string,
  input: ApplyObjectEdit,
  runtime: ObjectEditingRuntime,
  signal: AbortSignal,
  emit: (event: EventDraft) => void,
): Promise<void> {
  const call: ObjectEditingRuntime["client"]["callTool"] = async (
    name,
    args,
  ) => {
    signal.throwIfAborted();
    const result = await runtime.client.callTool(name, args, { signal });
    if (result.isError) throw toolFailure(result.error);
    return result;
  };
  emit({ type: "progress", stage: "proposing" });
  const proposal = await call(
    "propose_model_source",
    {
      projectId,
      parentRevision: input.parentRevision,
      requestId: input.requestId,
      toolCallId: input.requestId,
      modelFiles: input.modelFiles,
    },
    { signal },
  );
  let { candidate } = proposeModelSourceOutputSchema.parse(
    proposal.structuredContent,
  );
  if (
    candidate.projectId !== projectId ||
    candidate.parentRevision !== input.parentRevision
  )
    throw new Error("Candidate mismatch");
  if (candidate.state === "PROMOTED") {
    const result = await call("list_revisions", { projectId }, { signal });
    const revision = listRevisionsOutputSchema
      .parse(result.structuredContent)
      .revisions.find((item) => item.candidateId === candidate.candidateId);
    if (!revision) throw new Error("Promoted revision unavailable");
    emit({ type: "saved", revision: revision.revisionId });
    return;
  }
  if (candidate.state === "SUPERSEDED")
    throw toolFailure({ code: "STALE_REVISION" });
  // Exact retries may already have validated or promoted their immutable candidate.
  if (candidate.state === "CREATED" || candidate.state === "RUNNING") {
    emit({ type: "progress", stage: "validating" });
    const unsubscribe = runtime.browserRenderer.subscribe(
      candidate.candidateId,
      input.sessionId,
      (job) => {
        if (!signal.aborted) emit({ type: "render", job });
      },
    );
    try {
      const result = await call(
        "validate_and_render",
        {
          projectId,
          candidateId: candidate.candidateId,
          previewProfile: "standard",
        },
        { signal },
      );
      candidate = validateAndRenderOutputSchema.parse(
        result.structuredContent,
      ).candidate;
    } finally {
      unsubscribe();
    }
  }
  if (candidate.state !== "VALID" && candidate.state !== "PROMOTED") {
    const diagnostic =
      candidate.diagnostics.find(
        (item) =>
          item.severity === "error" && item.message.startsWith("ERROR:"),
      ) ?? candidate.diagnostics.find((item) => item.severity === "error");
    throw new ObjectFailure({
      code: "MODEL_REJECTED",
      message:
        diagnostic?.message.slice(0, 500) ??
        "The model could not be validated. Adjust your draft and try again.",
    });
  }
  emit({ type: "progress", stage: "promoting" });
  const result = await call(
    "promote_candidate",
    {
      projectId,
      candidateId: candidate.candidateId,
      expectedParentRevision: input.parentRevision,
    },
    { signal },
  );
  const { revision } = promoteCandidateOutputSchema.parse(
    result.structuredContent,
  );
  if (
    revision.projectId !== projectId ||
    revision.candidateId !== candidate.candidateId
  )
    throw new Error("Revision mismatch");
  emit({ type: "saved", revision: revision.revisionId });
}
