import {
  listRevisionsOutputSchema,
  promoteCandidateOutputSchema,
  proposeModelSourceOutputSchema,
  validateAndRenderOutputSchema,
} from "@theoryfoundry/contracts";
import { CadDomainError } from "@theoryfoundry/runtime";
import type { SaveWorkingModel } from "../workingModel.schema";
import type {
  WorkingModelEvent,
  WorkingModelRuntime,
} from "../workingModel.port";
import { prepareWorkingModel } from "../services/prepareWorkingModel.service";

export async function saveWorkingModel(
  projectId: string,
  input: SaveWorkingModel,
  runtime: WorkingModelRuntime,
  signal: AbortSignal,
  emit: (event: WorkingModelEvent) => void,
): Promise<void> {
  async function call(
    name: Parameters<typeof runtime.client.callTool>[0],
    args: Record<string, unknown>,
  ): Promise<unknown> {
    signal.throwIfAborted();
    const result = await runtime.client.callTool(name, args, { signal });
    if (result.isError) throw result.error;
    return result.structuredContent;
  }

  emit({ type: "progress", stage: "proposing" });
  const prepared = await prepareWorkingModel(
    runtime.repository,
    projectId,
    input,
    signal,
  );
  if (!prepared.changed)
    throw new CadDomainError(
      "INVALID_PARAMETERS",
      "There are no model changes to save.",
    );
  let { candidate } = proposeModelSourceOutputSchema.parse(
    await call("propose_model_source", prepared.proposal(input.requestId)),
  );
  const candidateId = candidate.candidateId;
  if (
    candidate.projectId !== projectId ||
    candidate.parentRevision !== input.parentRevision ||
    candidate.sourceHash !== prepared.preview.sourceHash
  )
    throw new Error("Working model candidate mismatch");

  async function findSavedRevision(): Promise<string | undefined> {
    const { revisions } = listRevisionsOutputSchema.parse(
      await call("list_revisions", { projectId }),
    );
    return revisions.find((revision) => revision.candidateId === candidateId)
      ?.revisionId;
  }

  if (candidate.state === "CREATED" || candidate.state === "RUNNING") {
    emit({ type: "progress", stage: "validating" });
    const unsubscribe = runtime.browserRenderer.subscribe(
      candidateId,
      input.sessionId,
      (job) => {
        if (!signal.aborted) emit({ type: "render", job });
      },
    );
    try {
      candidate = validateAndRenderOutputSchema.parse(
        await call("validate_and_render", {
          projectId,
          candidateId,
          previewProfile: "standard",
        }),
      ).candidate;
    } finally {
      unsubscribe();
    }
  }
  if (candidate.state === "PROMOTED") {
    const saved = await findSavedRevision();
    if (!saved) throw new Error("The saved revision is unavailable");
    emit({ type: "saved", revision: saved });
    return;
  }
  if (candidate.state === "SUPERSEDED")
    throw new CadDomainError("STALE_REVISION", "A newer revision is current.");
  if (candidate.state !== "VALID") {
    const diagnostic = candidate.diagnostics.find(
      (item) => item.severity === "error",
    );
    emit({
      type: "error",
      error: {
        code: "MODEL_REJECTED",
        message:
          diagnostic?.message.slice(0, 500) ??
          "The working model could not be validated.",
      },
    });
    return;
  }

  emit({ type: "progress", stage: "promoting" });
  try {
    const { revision } = promoteCandidateOutputSchema.parse(
      await call("promote_candidate", {
        projectId,
        candidateId,
        expectedParentRevision: input.parentRevision,
      }),
    );
    if (
      revision.projectId !== projectId ||
      revision.candidateId !== candidateId
    )
      throw new Error("Saved revision mismatch");
    emit({ type: "saved", revision: revision.revisionId });
  } catch (error) {
    const saved = await findSavedRevision();
    if (!saved) throw error;
    emit({ type: "saved", revision: saved });
  }
}
