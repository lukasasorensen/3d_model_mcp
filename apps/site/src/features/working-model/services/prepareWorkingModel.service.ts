import { createHash } from "node:crypto";
import {
  applyParameterOperations,
  canonicalModelFiles,
  proposeModelSourceInputSchema,
} from "@theoryfoundry/contracts";
import { CadDomainError, prepareModelDocument } from "@theoryfoundry/runtime";
import { ZodError } from "zod/v4";
import type {
  PreparedWorkingPreview,
  WorkingModel,
} from "../workingModel.schema";
import type { WorkingModelRuntime } from "../workingModel.port";

export async function prepareWorkingModel(
  repository: Pick<WorkingModelRuntime["repository"], "readModelSource">,
  projectId: string,
  input: WorkingModel,
  signal: AbortSignal,
): Promise<{
  proposal(
    requestId: string,
  ): ReturnType<typeof proposeModelSourceInputSchema.parse>;
  changed: boolean;
  preview: PreparedWorkingPreview;
}> {
  signal.throwIfAborted();
  const parent = await repository.readModelSource(
    projectId,
    input.parentRevision,
  );
  signal.throwIfAborted();
  const modelFiles = input.modelFiles ?? parent.modelFiles;
  const modelBody = modelFiles ? undefined : parent.modelBody;
  if (!modelFiles && !modelBody)
    throw new CadDomainError(
      "INVALID_PARAMETERS",
      "This revision has no editable model.",
    );
  let parameters;
  try {
    parameters = applyParameterOperations(
      parent.parameters ?? [],
      input.operations,
    );
  } catch (error) {
    if (!(error instanceof ZodError)) throw error;
    throw new CadDomainError(
      "INVALID_PARAMETERS",
      error.issues[0]?.message ?? "A parameter value is invalid.",
    );
  }
  const content = {
    projectId,
    parentRevision: parent.revision,
    modelFiles,
    modelBody,
    parameters,
  };
  const proposal = (
    requestId: string,
  ): ReturnType<typeof proposeModelSourceInputSchema.parse> =>
    proposeModelSourceInputSchema.parse({
      ...content,
      requestId,
      toolCallId: requestId,
    });
  const { source } = prepareModelDocument(content, parent.parameters);
  const changed =
    JSON.stringify(parameters) !== JSON.stringify(parent.parameters ?? []) ||
    Boolean(
      input.modelFiles &&
      (!parent.modelFiles ||
        JSON.stringify(canonicalModelFiles(input.modelFiles)) !==
          JSON.stringify(canonicalModelFiles(parent.modelFiles))),
    );
  return {
    proposal,
    changed,
    preview: {
      parentRevision: parent.revision,
      source,
      sourceHash: createHash("sha256").update(source).digest("hex"),
    },
  };
}
