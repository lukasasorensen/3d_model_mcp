import {
  getProjectStateOutputSchema,
  readModelSourceOutputSchema,
} from "@theoryfoundry/contracts";
import type { CadMcpClient } from "@theoryfoundry/gateway";
import {
  objectEditingSnapshotSchema,
  type ObjectEditingSnapshot,
} from "../objectEditing.schema";
import { toolFailure } from "../utils/objectFailure.util";

export async function readObjects(
  client: CadMcpClient,
  projectId: string,
  revision: string | undefined,
  signal: AbortSignal,
): Promise<ObjectEditingSnapshot> {
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
      modelFiles: null,
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
  // Legacy single-source projects acquire stable identities on their first edit.
  const body = model.modelBody ?? model.source;
  return objectEditingSnapshotSchema.parse({
    revision,
    sourceHash: model.sourceHash,
    parameters: model.parameters ?? [],
    modelFiles:
      model.modelFiles ??
      (body
        ? {
            version: 1,
            files: [{ id: "main-file", name: "Main", body }],
            objects: [{ id: "main-object", name: "Main", fileId: "main-file" }],
            composition: { operation: "union", objectIds: ["main-object"] },
          }
        : null),
  });
}
