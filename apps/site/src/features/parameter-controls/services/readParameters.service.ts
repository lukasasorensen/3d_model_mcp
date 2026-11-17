import {
  getProjectStateOutputSchema,
  readModelSourceOutputSchema,
  parameterControlsSnapshotSchema,
  type ParameterControlsSnapshot,
} from "@theoryfoundry/contracts";
import type { CadMcpClient } from "@theoryfoundry/gateway";
import { toolFailure } from "../utils/parameterFailure.util";

export async function readParameters(
  client: CadMcpClient,
  projectId: string,
  revision: string | undefined,
  signal: AbortSignal,
): Promise<ParameterControlsSnapshot> {
  if (!revision) {
    const result = await client.callTool(
      "get_project_state",
      { projectId },
      { signal },
    );
    if (result.isError) throw toolFailure(result.error);
    revision =
      getProjectStateOutputSchema.parse(result.structuredContent).state
        .currentRevision ?? undefined;
  }
  if (!revision)
    return {
      revision: null,
      sourceHash: null,
      editable: false,
      parameters: [],
    };
  const result = await client.callTool(
    "read_model_source",
    { projectId, revision },
    { signal },
  );
  if (result.isError) throw toolFailure(result.error);
  const { model } = readModelSourceOutputSchema.parse(result.structuredContent);
  if (model.revision !== revision) throw new Error("Revision mismatch");
  return parameterControlsSnapshotSchema.parse({
    revision,
    sourceHash: model.sourceHash,
    parameters: model.parameters ?? [],
    editable: model.modelBody !== undefined || model.modelFiles !== undefined,
  });
}
